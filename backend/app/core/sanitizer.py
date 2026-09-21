import re
from typing import Any

# Dictionnaire de correction des phrases et termes Windows courants altérés par l'encodage OEM/ANSI
FRENCH_WINDOWS_CORRECTIONS = {
    # WDAG & DefaultAccount descriptions
    r"Compte d'utilisateur g[\ufffd\?]?r[\ufffd\?]? et utilis[\ufffd\?]? par le syst[\ufffd\?]?me pour les sc[\ufffd\?]?narios[\s\ufffd\?]+Windows[\s\ufffd\?]+Defender[\s\ufffd\?]+Application[\s\ufffd\?]+Guard\.?":
        "Compte d'utilisateur géré et utilisé par le système pour les scénarios Windows Defender Application Guard.",
    r"Compte d'utilisateur g[\ufffd\?]?r[\ufffd\?]? par le syst[\ufffd\?]?me\.?":
        "Compte d'utilisateur géré par le système.",
    r"Compte d'utilisateur d'administration":
        "Compte d'utilisateur d'administration",
    r"Compte d'utilisateur invit[\ufffd\?]?":
        "Compte d'utilisateur invité",
    r"^Invit[\ufffd\?]?$":
        "Invité",
    r"syst[\ufffd\?]?me": "système",
    r"g[\ufffd\?]?r[\ufffd\?]?": "géré",
    r"utilis[\ufffd\?]?": "utilisé",
    r"sc[\ufffd\?]?nario": "scénario",
    r"sc[\ufffd\?]?narios": "scénarios",
    r"param[\ufffd\?]?tre": "paramètre",
    r"param[\ufffd\?]?tres": "paramètres",
    r"d[\ufffd\?]?ploy[\ufffd\?]?": "déployé",
    r"ex[\ufffd\?]?cution": "exécution",
    r"t[\ufffd\?]?l[\ufffd\?]?chargement": "téléchargement",
    r"[\ufffd\?]": " "  # Supprime les losanges résiduels isolés
}


def sanitize_string(val: str) -> str:
    """Nettoie et répare les caractères accentués français et supprime les losanges de remplacement."""
    if not isinstance(val, str) or not val:
        return val

    # 1. Tentative de réparation de mojibake UTF-8 interprété en Latin-1 / CP1252 (ex: Ã© -> é)
    try:
        if any(seq in val for seq in ("Ã©", "Ã¨", "Ã ", "Ã´", "Ã®", "Ã«", "Ã¹", "Ã§", "â€™", "Ã‰", "Ãˆ")):
            val = val.encode("latin1").decode("utf-8")
    except Exception:
        pass

    # 2. Remplacement des séquences corrompues Windows FR avec \ufffd
    for pattern, replacement in FRENCH_WINDOWS_CORRECTIONS.items():
        if pattern == r"[\ufffd\?]":
            continue
        try:
            val = re.sub(pattern, replacement, val, flags=re.IGNORECASE)
        except Exception:
            pass

    # 3. Nettoyer les \ufffd restants
    val = val.replace("\ufffd", " ")
    # Nettoyer les espaces doubles créés
    val = re.sub(r" {2,}", " ", val).strip()

    return val


def sanitize_data(data: Any) -> Any:
    """Nettoie récursivement tous les champs textes d'une structure (dict, list, str)."""
    if isinstance(data, str):
        return sanitize_string(data)
    elif isinstance(data, dict):
        return {k: sanitize_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_data(item) for item in data]
    return data
