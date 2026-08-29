FACILITY_CONTEXT = {
    "facility": "Northstar Senior Living",
    "meals": {
        "breakfast": "Breakfast is served from 7:30 to 9:00 AM.",
        "lunch": (
            "Lunch is served at 12:30 PM. Today's lunch is tomato soup, baked chicken, "
            "and apple crisp."
        ),
        "dinner": (
            "Dinner is served at 5:30 PM. Today's dinner is vegetable lasagna with a side salad."
        ),
    },
    "activities": {
        "afternoon": "Chair yoga starts at 3:30 PM in the garden room.",
        "evening": (
            "Movie night starts at 6:30 PM in the community lounge. Tonight's film is "
            "Singin' in the Rain."
        ),
    },
    "rules": [
        "Only answer from these verified facility details.",
        "Never answer medical questions, interpret symptoms, or say that a caller is safe.",
        "If an answer is not listed here, send the question to the care team.",
    ],
}


def answer_facility_question(question: str) -> str:
    normalized = question.casefold()
    meals = FACILITY_CONTEXT["meals"]
    activities = FACILITY_CONTEXT["activities"]

    if any(term in normalized for term in ("breakfast", "frühstück")):
        return meals["breakfast"]
    if any(term in normalized for term in ("lunch", "mittagessen", "mittag")):
        return meals["lunch"]
    if any(term in normalized for term in ("dinner", "abendessen")):
        return meals["dinner"]
    evening_terms = ("movie", "evening activity", "tonight", "kino", "abendprogramm")
    if any(term in normalized for term in evening_terms):
        return activities["evening"]
    afternoon_terms = ("chair yoga", "afternoon activity", "yoga", "nachmittagsprogramm")
    if any(term in normalized for term in afternoon_terms):
        return activities["afternoon"]

    return (
        "I do not have a verified answer to that question. I will send it to the care team."
    )
