"""Feature catalogue for the UCI Student Performance dataset (Cortez & Silva, 2008).

Every raw attribute is described once here so the API can serve the same
metadata to the frontend form, the explainer and the recommendation engine.
"""

BINARY_COLS = [
    "schoolsup", "famsup", "paid", "activities", "nursery",
    "higher", "internet", "romantic",
]
NOMINAL_COLS = [
    "school", "sex", "address", "famsize", "Pstatus",
    "Mjob", "Fjob", "reason", "guardian", "subject",
]
ORDINAL_COLS = [
    "age", "Medu", "Fedu", "traveltime", "studytime", "failures",
    "famrel", "freetime", "goout", "Dalc", "Walc", "health", "absences",
]
GRADE_COLS = ["G1", "G2"]

# The UCI data only covers Maths and Portuguese. The model therefore learns at
# the level of subject *group*: STEM subjects inherit the Maths profile and
# language/humanities subjects inherit the Portuguese (language & literature)
# profile. Only the group reaches the model; the subject itself is metadata.
SUBJECTS = ["maths", "science", "english", "hindi", "history"]
SUBJECT_LABELS = ["Maths", "Science", "English", "Hindi", "History"]
SUBJECT_GROUP = {
    "maths": "stem", "science": "stem",
    "english": "languages", "hindi": "languages", "history": "languages",
    # source-data subjects
    "math": "stem", "portuguese": "languages",
}
GROUP_LABELS = {"stem": "STEM", "languages": "Languages & humanities"}
GROUP_REPRESENTATIVE = {"stem": "maths", "languages": "english"}
SUBJECT_ALIASES = {"math": "maths", "mathematics": "maths", "portuguese": "english"}
TARGET = "G3"
PASS_MARK = 10  # Portuguese 0-20 scale: >= 10 is a pass

ENGINEERED_COLS = [
    "parent_edu", "alcohol_index", "social_score",
    "support_score", "has_failures", "log_absences",
]
TREND_COLS = ["grade_trend", "grade_mean"]

JOBS = ["teacher", "health", "services", "at_home", "other"]

# group -> human description; used by the multi-step form and the explainer
GROUPS = {
    "profile": "Student profile",
    "family": "Family background",
    "academic": "Study habits & history",
    "lifestyle": "Lifestyle & wellbeing",
    "grades": "Period grades (optional)",
}

FEATURES = {
    "subject":   {"label": "Subject", "group": "profile", "type": "select", "options": SUBJECTS,
                  "optionLabels": SUBJECT_LABELS, "default": "maths",
                  "hint": "Maths & Science use the STEM model; English, Hindi & History use the languages & humanities model."},
    "school":    {"label": "School", "group": "profile", "type": "select", "options": ["GP", "MS"], "optionLabels": ["Gabriel Pereira", "Mousinho da Silveira"], "default": "GP"},
    "sex":       {"label": "Gender", "group": "profile", "type": "select", "options": ["F", "M"], "optionLabels": ["Female", "Male"], "default": "F"},
    "age":       {"label": "Age", "group": "profile", "type": "range", "min": 15, "max": 22, "default": 17},
    "address":   {"label": "Home area", "group": "profile", "type": "select", "options": ["U", "R"], "optionLabels": ["Urban", "Rural"], "default": "U"},
    "traveltime": {"label": "Commute time", "group": "profile", "type": "range", "min": 1, "max": 4, "default": 1,
                   "scale": ["<15 min", "15-30 min", "30-60 min", ">1 hour"], "actionable": False},
    "reason":    {"label": "Reason for school choice", "group": "profile", "type": "select", "options": ["home", "reputation", "course", "other"], "default": "course"},

    "famsize":   {"label": "Family size", "group": "family", "type": "select", "options": ["LE3", "GT3"], "optionLabels": ["3 or fewer", "More than 3"], "default": "GT3"},
    "Pstatus":   {"label": "Parents' cohabitation", "group": "family", "type": "select", "options": ["T", "A"], "optionLabels": ["Together", "Apart"], "default": "T"},
    "Medu":      {"label": "Mother's education", "group": "family", "type": "range", "min": 0, "max": 4, "default": 2,
                  "scale": ["None", "Primary (4th)", "5th-9th grade", "Secondary", "Higher"]},
    "Fedu":      {"label": "Father's education", "group": "family", "type": "range", "min": 0, "max": 4, "default": 2,
                  "scale": ["None", "Primary (4th)", "5th-9th grade", "Secondary", "Higher"]},
    "Mjob":      {"label": "Mother's job", "group": "family", "type": "select", "options": JOBS, "default": "other"},
    "Fjob":      {"label": "Father's job", "group": "family", "type": "select", "options": JOBS, "default": "other"},
    "guardian":  {"label": "Guardian", "group": "family", "type": "select", "options": ["mother", "father", "other"], "default": "mother"},
    "famrel":    {"label": "Family relationship quality", "group": "family", "type": "range", "min": 1, "max": 5, "default": 4},
    "famsup":    {"label": "Family educational support", "group": "family", "type": "bool", "default": True, "actionable": True},

    "studytime": {"label": "Weekly study time", "group": "academic", "type": "range", "min": 1, "max": 4, "default": 2,
                  "scale": ["<2 hours", "2-5 hours", "5-10 hours", ">10 hours"], "actionable": True, "better": "higher"},
    "failures":  {"label": "Past class failures", "group": "academic", "type": "range", "min": 0, "max": 3, "default": 0},
    "absences":  {"label": "School absences", "group": "academic", "type": "range", "min": 0, "max": 93, "default": 4,
                  "actionable": True, "better": "lower"},
    "schoolsup": {"label": "Extra school support", "group": "academic", "type": "bool", "default": False, "actionable": True},
    "paid":      {"label": "Paid extra classes", "group": "academic", "type": "bool", "default": False, "actionable": True},
    "higher":    {"label": "Wants higher education", "group": "academic", "type": "bool", "default": True, "actionable": True},
    "nursery":   {"label": "Attended nursery school", "group": "academic", "type": "bool", "default": True},
    "internet":  {"label": "Internet at home", "group": "academic", "type": "bool", "default": True, "actionable": True},
    "activities": {"label": "Extra-curricular activities", "group": "academic", "type": "bool", "default": False, "actionable": True},

    "freetime":  {"label": "Free time after school", "group": "lifestyle", "type": "range", "min": 1, "max": 5, "default": 3},
    "goout":     {"label": "Going out with friends", "group": "lifestyle", "type": "range", "min": 1, "max": 5, "default": 3,
                  "actionable": True, "better": "lower"},
    "Dalc":      {"label": "Weekday alcohol use", "group": "lifestyle", "type": "range", "min": 1, "max": 5, "default": 1,
                  "actionable": True, "better": "lower"},
    "Walc":      {"label": "Weekend alcohol use", "group": "lifestyle", "type": "range", "min": 1, "max": 5, "default": 2,
                  "actionable": True, "better": "lower"},
    "health":    {"label": "Current health", "group": "lifestyle", "type": "range", "min": 1, "max": 5, "default": 4},
    "romantic":  {"label": "In a relationship", "group": "lifestyle", "type": "bool", "default": False},

    "G1":        {"label": "Period 1 grade", "group": "grades", "type": "range", "min": 0, "max": 20, "default": None, "optional": True},
    "G2":        {"label": "Period 2 grade", "group": "grades", "type": "range", "min": 0, "max": 20, "default": None, "optional": True},
}

RAW_INPUT_COLS = [c for c in FEATURES]  # includes G1/G2


def grade_band(g: float) -> str:
    """Five-level classification used in the original paper (Erasmus-style)."""
    if g >= 16:
        return "A"
    if g >= 14:
        return "B"
    if g >= 12:
        return "C"
    if g >= 10:
        return "D"
    return "F"


def risk_tier(fail_prob: float) -> str:
    if fail_prob >= 0.6:
        return "high"
    if fail_prob >= 0.3:
        return "medium"
    return "low"
