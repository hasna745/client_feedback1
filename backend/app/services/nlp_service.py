from functools import lru_cache
import re
import unicodedata
from typing import Any

import yake
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

POSITIVE_THRESHOLD = 0.05
NEGATIVE_THRESHOLD = -0.05
MAX_KEYWORDS = 10

FRENCH_MARKERS = {
    "je",
    "nous",
    "vous",
    "le",
    "la",
    "les",
    "des",
    "une",
    "avec",
    "pour",
    "mais",
    "tres",
    "service",
    "client",
}
POSITIVE_WORDS = {
    "excellent",
    "parfait",
    "satisfait",
    "satisfaite",
    "rapide",
    "facile",
    "clair",
    "claire",
    "efficace",
    "merci",
    "bien",
    "bon",
    "bonne",
    "super",
    "genial",
    "aime",
    "utile",
    "professionnel",
    "recommande",
    "amazing",
    "great",
    "good",
    "helpful",
    "fast",
    "easy",
    "love",
    "perfect",
}
NEGATIVE_WORDS = {
    "mauvais",
    "mauvaise",
    "lent",
    "lente",
    "difficile",
    "probleme",
    "bug",
    "cher",
    "chere",
    "retard",
    "decu",
    "deçue",
    "insatisfait",
    "insatisfaite",
    "nul",
    "erreur",
    "plainte",
    "complique",
    "poor",
    "bad",
    "slow",
    "problem",
    "issue",
    "expensive",
    "disappointed",
    "confusing",
}


@lru_cache(maxsize=1)
def get_sentiment_analyzer() -> SentimentIntensityAnalyzer:
    return SentimentIntensityAnalyzer()


@lru_cache(maxsize=1)
def get_keyword_extractor() -> yake.KeywordExtractor:
    return yake.KeywordExtractor(
        lan="en",
        n=3,
        dedupLim=0.9,
        top=MAX_KEYWORDS,
        features=None,
    )


@lru_cache(maxsize=4)
def get_keyword_extractor_for_language(language: str) -> yake.KeywordExtractor:
    return yake.KeywordExtractor(
        lan=language,
        n=3,
        dedupLim=0.9,
        top=MAX_KEYWORDS,
        features=None,
    )


def normalize_for_matching(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.lower())
    return "".join(character for character in normalized if not unicodedata.combining(character))


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-ZÀ-ÿ']+", normalize_for_matching(text))


def detect_language(text: str) -> str:
    normalized_text = normalize_for_matching(text)
    words = set(tokenize(normalized_text))
    if any(character in text for character in "àâçéèêëîïôùûüÿœ"):
        return "fr"
    if len(words & FRENCH_MARKERS) >= 2:
        return "fr"
    return "en"


def lexical_sentiment_score(text: str) -> float | None:
    words = tokenize(text)
    if not words:
        return None

    positive_hits = sum(1 for word in words if word in POSITIVE_WORDS)
    negative_hits = sum(1 for word in words if word in NEGATIVE_WORDS)
    total_hits = positive_hits + negative_hits
    if not total_hits:
        return None

    score = (positive_hits - negative_hits) / total_hits
    return max(min(score, 1.0), -1.0)


def sentiment_label_from_score(score: float) -> str:
    if score >= POSITIVE_THRESHOLD:
        return "positive"

    if score <= NEGATIVE_THRESHOLD:
        return "negative"

    return "neutral"


def analyze_sentiment(text: str) -> dict[str, float | str]:
    normalized_text = text.strip()
    vader_score = get_sentiment_analyzer().polarity_scores(normalized_text)["compound"]
    lexical_score = lexical_sentiment_score(normalized_text)
    score = (
        (vader_score + lexical_score) / 2
        if lexical_score is not None
        else vader_score
    )

    return {
        "score": score,
        "label": sentiment_label_from_score(score),
    }


def extract_keywords(text: str) -> list[str]:
    normalized_text = text.strip()
    if not normalized_text:
        return []

    language = detect_language(normalized_text)
    try:
        extractor = get_keyword_extractor_for_language(language)
        extracted_keywords = extractor.extract_keywords(normalized_text)
    except Exception:
        extracted_keywords = get_keyword_extractor().extract_keywords(normalized_text)
    keywords: list[str] = []
    seen_keywords: set[str] = set()

    for keyword, _score in extracted_keywords:
        normalized_keyword = keyword.strip()
        dedupe_key = normalized_keyword.lower()

        if normalized_keyword and dedupe_key not in seen_keywords:
            keywords.append(normalized_keyword)
            seen_keywords.add(dedupe_key)

    return keywords


def analyze_text(text: str) -> dict[str, Any]:
    sentiment = analyze_sentiment(text)

    return {
        "sentiment_score": sentiment["score"],
        "sentiment_label": sentiment["label"],
        "keywords": extract_keywords(text),
    }
