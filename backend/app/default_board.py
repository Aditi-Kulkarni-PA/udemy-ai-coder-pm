DEFAULT_COLUMNS: list[dict[str, str]] = [
    {"id": "col-backlog", "title": "Backlog"},
    {"id": "col-discovery", "title": "Discovery"},
    {"id": "col-progress", "title": "In Progress"},
    {"id": "col-review", "title": "Review"},
    {"id": "col-done", "title": "Done"},
]

DEFAULT_CARDS: dict[str, dict[str, str]] = {
    "card-1": {
        "id": "card-1",
        "title": "Align roadmap themes",
        "details": "Draft quarterly themes with impact statements and metrics.",
    },
    "card-2": {
        "id": "card-2",
        "title": "Gather customer signals",
        "details": "Review support tags, sales notes, and churn feedback.",
    },
    "card-3": {
        "id": "card-3",
        "title": "Prototype analytics view",
        "details": "Sketch initial dashboard layout and key drill-downs.",
    },
    "card-4": {
        "id": "card-4",
        "title": "Refine status language",
        "details": "Standardize column labels and tone across the board.",
    },
    "card-5": {
        "id": "card-5",
        "title": "Design card layout",
        "details": "Add hierarchy and spacing for scanning dense lists.",
    },
    "card-6": {
        "id": "card-6",
        "title": "QA micro-interactions",
        "details": "Verify hover, focus, and loading states.",
    },
    "card-7": {
        "id": "card-7",
        "title": "Ship marketing page",
        "details": "Final copy approved and asset pack delivered.",
    },
    "card-8": {
        "id": "card-8",
        "title": "Close onboarding sprint",
        "details": "Document release notes and share internally.",
    },
}

DEFAULT_COLUMN_CARD_ORDER: dict[str, list[str]] = {
    "col-backlog": ["card-1", "card-2"],
    "col-discovery": ["card-3"],
    "col-progress": ["card-4", "card-5"],
    "col-review": ["card-6"],
    "col-done": ["card-7", "card-8"],
}
