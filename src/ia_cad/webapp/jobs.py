"""
jobs.py — File d'extraction et worker de fond pour le front Flask.

Un seul thread de fond consomme une queue.Queue : les extractions sont
sérialisées (jamais deux appels Ollama en parallèle). L'état des jobs vit en
mémoire process (dict global) — perdu si le serveur redémarre, ce qui est
acceptable pour un outil local mono-utilisateur (voir plan).

Ne modifie rien au pipeline : appelle directement extract.extract_article()
et écrit le résultat avec la même convention que extract.main()
(common.corpus.route() pour le dossier test/production).
"""
import json
import queue
import sys
import threading
import uuid
from datetime import date, datetime

from ia_cad.extraction import extract as extract_mod
from ia_cad.common import corpus
from ia_cad.tools.evaluation import relations_variants

ARTICLES_DIR = extract_mod._ARTICLES

_JOBS: dict[str, dict] = {}
_LOCK = threading.Lock()
_QUEUE: "queue.Queue[str]" = queue.Queue()
_MAX_LOG_LINES = 500


class _LogCapture:
    """Redirige stdout vers le log du job (par ligne) tout en gardant la
    sortie console normale — un seul thread écrit jamais concurremment ici
    (un seul worker), donc pas besoin de verrou sur le buffer."""

    def __init__(self, job: dict, real_stdout):
        self.job = job
        self.real_stdout = real_stdout
        self._buf = ""

    def write(self, s: str):
        self.real_stdout.write(s)
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            line = line.rstrip("\r")
            if line.strip():
                self.job["log"].append(line)
        if len(self.job["log"]) > _MAX_LOG_LINES:
            self.job["log"] = self.job["log"][-_MAX_LOG_LINES:]

    def flush(self):
        self.real_stdout.flush()


def submit_job(stems: list[str], model: str | None, chunks: list[str],
               no_factcheck: bool, debug: bool, no_split: bool,
               no_metadata: bool = False) -> str:
    job_id = uuid.uuid4().hex[:12]
    job = {
        "id": job_id,
        "kind": "extract",
        "status": "queued",
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "options": {
            "model": model, "chunks": chunks,
            "no_factcheck": no_factcheck, "debug": debug, "no_split": no_split,
            "no_metadata": no_metadata,
        },
        "order": list(stems),
        "articles": {
            s: {"status": "pending", "n_relations": None, "n_rejected": None, "error": None}
            for s in stems
        },
        "current": None,
        "log": [],
    }
    with _LOCK:
        _JOBS[job_id] = job
    _QUEUE.put(job_id)
    return job_id


def submit_relations_variant_job(tag: str, variant: str, stems: list[str], model: str | None) -> str:
    """Comme submit_job(), mais pour un run du harness relations_variants (voir
    tools/relations_variants.py) : extraction du bloc relations SEUL, texte
    composé selon `variant`, scoré contre le GT test au fil de l'eau.

    Même queue/thread que submit_job() (voir _worker_loop) : jamais deux appels
    Ollama en parallèle, extraction normale et run de variante se sérialisent."""
    job_id = uuid.uuid4().hex[:12]
    job = {
        "id": job_id,
        "kind": "relations_variant",
        "status": "queued",
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "options": {"tag": tag, "variant": variant, "model": model},
        "order": list(stems),
        "articles": {
            s: {"status": "pending", "n_relations": None, "n_rejected": None, "error": None}
            for s in stems
        },
        "current": None,
        "log": [],
    }
    with _LOCK:
        _JOBS[job_id] = job
    _QUEUE.put(job_id)
    return job_id


def get_job(job_id: str) -> dict | None:
    return _JOBS.get(job_id)


def list_jobs() -> list[dict]:
    """Résumés triés du plus récent au plus ancien (pas le log complet)."""
    jobs = sorted(_JOBS.values(), key=lambda j: j["created_at"], reverse=True)
    return [
        {
            "id": j["id"], "status": j["status"], "created_at": j["created_at"],
            "current": j["current"], "n_total": len(j["order"]),
            "n_done": sum(1 for a in j["articles"].values() if a["status"] == "done"),
            "n_error": sum(1 for a in j["articles"].values() if a["status"] == "error"),
        }
        for j in jobs
    ]


def _run_job(job_id: str) -> None:
    job = _JOBS[job_id]
    job["status"] = "running"
    real_stdout = sys.stdout
    sys.stdout = _LogCapture(job, real_stdout)
    try:
        if job["kind"] == "relations_variant":
            _run_relations_variant_job(job)
        else:
            _run_extract_job(job)
        job["status"] = "done"
    finally:
        sys.stdout = real_stdout
        job["current"] = None


def _run_extract_job(job: dict) -> None:
    opts = job["options"]
    model_name, model_cfg = extract_mod.load_model_cfg(opts["model"])

    for stem in job["order"]:
        job["current"] = stem
        job["articles"][stem]["status"] = "running"
        path = ARTICLES_DIR / f"{stem}.pdf"
        try:
            result = extract_mod.extract_article(
                path, model_name, model_cfg, opts["chunks"],
                opts["no_factcheck"], opts["debug"], split=not opts["no_split"],
                no_metadata=opts.get("no_metadata", False),
            )
            out_dir = corpus.route(extract_mod._OUT_DIR / str(date.today()), stem)
            out_path = out_dir / f"{stem}_type.json"
            out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            job["articles"][stem].update({
                "status": "done",
                "n_relations": len(result.get("Relations", [])),
                "n_rejected": len(result.get("_rejected", [])),
            })
        except Exception as e:  # une erreur par article ne bloque pas le reste du job
            job["articles"][stem].update({"status": "error", "error": str(e)})


def _run_relations_variant_job(job: dict) -> None:
    """Délègue à relations_variants.compute_run_summary(), qui boucle elle-même
    sur tous les stems (écriture + scoring compris) — les callbacks on_article_start/
    on_article_done tiennent job["current"]/job["articles"] à jour pour le polling
    du front, sur le même contrat que _run_extract_job()."""
    opts = job["options"]
    model_name, model_cfg = extract_mod.load_model_cfg(opts["model"])

    def on_start(stem):
        job["current"] = stem
        job["articles"][stem]["status"] = "running"

    def on_done(stem, row, error):
        if error is not None:
            job["articles"][stem].update({"status": "error", "error": error})
        else:
            job["articles"][stem].update({
                "status": "done",
                "n_relations": row["n_res_rels"],
                "n_rejected": row["n_rejected"],
            })

    relations_variants.compute_run_summary(
        opts["tag"], opts["variant"], job["order"], model_name, model_cfg,
        on_article_start=on_start, on_article_done=on_done,
    )


def _worker_loop() -> None:
    while True:
        job_id = _QUEUE.get()
        try:
            _run_job(job_id)
        except Exception as e:
            job = _JOBS.get(job_id)
            if job is not None:
                job["status"] = "error"
                job["log"].append(f"[ERREUR JOB] {e}")
        finally:
            _QUEUE.task_done()


_worker_thread = threading.Thread(target=_worker_loop, daemon=True, name="extraction-worker")
_worker_thread.start()
