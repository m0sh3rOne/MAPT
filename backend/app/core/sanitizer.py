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
    
    # Corrections de mots avec délimiteurs de mots (\b) pour ne JAMAIS altérer 'utilisateur'
    r"\butilis[é\ufffd\?]+ateur(s?)\b": r"utilisateur\1",
    r"\butilis[é\ufffd\?]+atrice(s?)\b": r"utilisatrice\1",
    r"\butilis[\ufffd\?](e?s?)\b": r"utilisé\1",
    r"\bg[\ufffd\?]r[\ufffd\?](e?s?)\b": r"géré\1",
    r"\bsyst[\ufffd\?]me(s?)\b": r"système\1",
    r"\bparam[\ufffd\?]tre(s?)\b": r"paramètre\1",
    r"\bsc[\ufffd\?]nario(s?)\b": r"scénario\1",
    r"\bd[\ufffd\?]ploy[\ufffd\?](e?s?)\b": r"déployé\1",
    r"\bex[\ufffd\?]cution(s?)\b": r"exécution\1",
    r"\bt[\ufffd\?]l[\ufffd\?]chargement(s?)\b": r"téléchargement\1",
    r"\binvit[\ufffd\?](e?s?)\b": r"invité\1",
    r"\benregistr[\ufffd\?](e?s?)\b": r"enregistré\1",
    r"\bconnect[\ufffd\?](e?s?)\b": r"connecté\1",
    r"\bd[\ufffd\?]connect[\ufffd\?](e?s?)\b": r"déconnecté\1",
    r"\bd[\ufffd\?]sactiv[\ufffd\?](e?s?)\b": r"désactivé\1",
    r"\bactiv[\ufffd\?](e?s?)\b": r"activé\1",
    r"\bcr[\ufffd\?][\ufffd\?]?(e?s?)\b": r"créé\1",
    r"\bpr[\ufffd\?]sent(e?s?)\b": r"présent\1",
    r"\bd[\ufffd\?]tail(s?)\b": r"détail\1",
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

    # 2. Remplacer toute dérive 'utiliséateur' existante
    val = re.sub(r"utilis[é\ufffd\?]+ateur", "utilisateur", val, flags=re.IGNORECASE)
    val = re.sub(r"utilis[é\ufffd\?]+atrice", "utilisatrice", val, flags=re.IGNORECASE)

    # 3. Remplacement des séquences corrompues Windows FR avec \ufffd
    for pattern, replacement in FRENCH_WINDOWS_CORRECTIONS.items():
        try:
            val = re.sub(pattern, replacement, val, flags=re.IGNORECASE)
        except Exception:
            pass

    # 4. Nettoyer les \ufffd restants
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
