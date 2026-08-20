from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ContentScoreInput:
    platform: str
    content_type: str
    views: int
    reach: float
    retention_rate: float | None
    likes: float
    comments: float
    shares: float
    saves: float
    audience_growth: int
    percentil_views: float
    percentil_retention: float | None
    percentil_signal: float
    percentil_conversion: float | None
    group_size: int


@dataclass(frozen=True)
class ContentScoreResult:
    score: float
    diagnosis: str
    details: dict[str, float | str]


def evaluate_content_score(data: ContentScoreInput) -> ContentScoreResult:
    denominator = _denominator(data)
    interactions = data.likes + data.comments + data.shares + data.saves
    strong_signals = data.comments + data.shares + data.saves
    weighted_signal = data.likes + (data.comments * 4) + (data.shares * 6) + (data.saves * 8)
    engagement_rate = _rate(interactions, denominator)
    weighted_signal_rate = _rate(weighted_signal, denominator)
    retention_for_score = min(data.retention_rate, 100.0) if data.retention_rate is not None else None
    subs_per_1k = (data.audience_growth / data.views) * 1000 if data.views > 0 else 0.0

    relative_score = _relative_score(data)
    high_allowed = _allows_high(data, interactions, strong_signals, subs_per_1k)
    elite_allowed = _allows_elite(data, interactions, strong_signals, subs_per_1k)
    confidence = _confidence(data, denominator)

    real_score = relative_score
    if not elite_allowed and real_score >= 85:
        real_score = 84.0
    if not high_allowed and real_score >= 65:
        real_score = 64.0

    level = _level(data, real_score, relative_score, high_allowed, elite_allowed)
    reason = _reason(data, level, subs_per_1k)

    return ContentScoreResult(
        score=round(real_score, 1),
        diagnosis=f"{level} {reason}",
        details={
            "relative_score": round(relative_score, 1),
            "real_score": round(real_score, 1),
            "score_confidence": confidence,
            "level": level,
            "reason": reason,
            "views_percentile": round(data.percentil_views, 1),
            "signal_percentile": round(data.percentil_signal, 1),
            "retention_percentile": round(data.percentil_retention or 0.0, 1),
            "conversion_percentile": round(data.percentil_conversion or 0.0, 1),
            "engagement_rate": engagement_rate,
            "weighted_signal_rate": weighted_signal_rate,
            "weighted_signal": round(weighted_signal, 2),
            "interactions": round(interactions, 2),
            "strong_signals": round(strong_signals, 2),
            "likes": round(data.likes, 2),
            "comments": round(data.comments, 2),
            "shares": round(data.shares, 2),
            "saves": round(data.saves, 2),
            "subs_per_1k": round(subs_per_1k, 2),
            "retention_for_score": round(retention_for_score or 0.0, 2),
            "score_basis": "realista",
        },
    )


def _relative_score(data: ContentScoreInput) -> float:
    if data.platform == "youtube":
        return _weighted_score(
            [
                (data.percentil_views, 0.25),
                (data.percentil_retention, 0.35),
                (data.percentil_signal, 0.20),
                (data.percentil_conversion, 0.20),
            ]
        )
    if data.platform == "facebook" and data.retention_rate is not None:
        return _weighted_score(
            [
                (data.percentil_views, 0.35),
                (data.percentil_retention, 0.30),
                (data.percentil_signal, 0.35),
            ]
        )
    if data.platform == "facebook":
        return _weighted_score([(data.percentil_views, 0.50), (data.percentil_signal, 0.50)])
    if data.platform == "instagram":
        return _weighted_score([(data.percentil_views, 0.45), (data.percentil_signal, 0.55)])
    return _weighted_score([(data.percentil_views, 0.50), (data.percentil_signal, 0.50)])


def _allows_elite(data: ContentScoreInput, interactions: float, strong_signals: float, subs_per_1k: float) -> bool:
    relative = _relative_score(data)
    if data.platform == "instagram":
        return data.reach >= 1000 and strong_signals >= 10 and relative >= 85
    if data.platform == "facebook":
        return data.views >= 5000 and (data.retention_rate or 0) >= 15 and interactions >= 50 and relative >= 85
    if data.platform == "youtube":
        return (
            data.views >= 20000
            and (data.retention_rate or 0) >= 75
            and (data.audience_growth >= 20 or subs_per_1k >= 2)
            and relative >= 85
        )
    return relative >= 90 and data.views >= 5000


def _allows_high(data: ContentScoreInput, interactions: float, strong_signals: float, subs_per_1k: float) -> bool:
    if data.platform == "instagram":
        return data.reach >= 300 and strong_signals >= 3
    if data.platform == "facebook" and data.retention_rate is not None:
        return data.views >= 1000 and data.retention_rate >= 7 and interactions >= 10
    if data.platform == "facebook":
        return data.views >= 500 and interactions >= 10
    if data.platform == "youtube":
        return data.views >= 5000 and (data.retention_rate or 0) >= 60 and (data.audience_growth > 0 or interactions >= 50)
    return data.views >= 500 and interactions >= 10


def _level(
    data: ContentScoreInput,
    real_score: float,
    relative_score: float,
    high_allowed: bool,
    elite_allowed: bool,
) -> str:
    if elite_allowed and real_score >= 85:
        return "[ÉLITE]"
    if high_allowed and real_score >= 65:
        return "[ALTO]"
    if relative_score >= 75 and not high_allowed and data.views > 0:
        return "[ALTO RELATIVO]"
    if real_score < 25 and data.percentil_views < 35 and data.percentil_signal < 35:
        return "[DESCARTE]"
    if real_score >= 40:
        return "[PROMEDIO]"
    return "[BAJO]"


def _reason(data: ContentScoreInput, level: str, subs_per_1k: float) -> str:
    if data.platform == "instagram":
        if level == "[ALTO RELATIVO]":
            return "Mejor de la muestra, falta escala"
        if level == "[DESCARTE]":
            return "Bajo alcance y sin señales profundas"
        if level == "[ALTO]":
            return "Buena señal real con escala suficiente"
        if level == "[PROMEDIO]":
            return "Normal para su histórico"
        return "Señal insuficiente para recomendar"

    if data.platform == "facebook":
        if data.retention_rate is not None and data.percentil_views > 70 and (data.percentil_retention or 0) < 35:
            return "Entra, pero no retiene"
        if level == "[ALTO RELATIVO]":
            return "Destaca internamente, falta escala real"
        if level in ("[ÉLITE]", "[ALTO]"):
            return "Buen alcance con retención/interacciones suficientes"
        if level == "[DESCARTE]":
            return "Bajo alcance y baja interacción"
        return "Rendimiento normal o débil según muestra"

    if data.platform == "youtube":
        if data.percentil_views > 70 and data.audience_growth < 20 and subs_per_1k < 1:
            return "Viralidad sin crecimiento"
        if level == "[ALTO RELATIVO]":
            return "Buen patrón interno, falta escala"
        if level in ("[ÉLITE]", "[ALTO]"):
            return "Retiene y gana audiencia" if data.audience_growth > 0 else "Retiene con señal fuerte"
        if level == "[DESCARTE]":
            return "Baja distribución y baja señal"
        return "No supera suficientes mínimos"

    if level == "[ALTO RELATIVO]":
        return "Mejor de la muestra, falta escala"
    if level == "[DESCARTE]":
        return "Bajo alcance y baja señal"
    return "Evaluación relativa conservadora"


def _confidence(data: ContentScoreInput, denominator: float) -> str:
    if data.group_size < 10 or denominator < 100:
        return "baja"
    if data.group_size < 30 or denominator < 500:
        return "media"
    return "alta"


def _denominator(data: ContentScoreInput) -> float:
    if data.platform in ("facebook", "instagram") and data.reach > 0:
        return data.reach
    return float(data.views)


def _rate(numerator: float, denominator: float | int | None) -> float:
    if not denominator:
        return 0.0
    return round((numerator / float(denominator)) * 100, 2)


def _weighted_score(parts: list[tuple[float | None, float]]) -> float:
    available = [(score, weight) for score, weight in parts if score is not None]
    weight_sum = sum(weight for _, weight in available)
    if weight_sum == 0:
        return 0.0
    return round(sum(score * (weight / weight_sum) for score, weight in available), 1)
