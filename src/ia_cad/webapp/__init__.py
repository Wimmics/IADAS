"""Interface web Flask de pilotage : lancer une extraction, suivre un job,
consulter un résultat ou une comparaison dans le navigateur. Worker unique
sérialisé (jamais deux appels Ollama concurrents) ; ne change rien au pipeline."""
