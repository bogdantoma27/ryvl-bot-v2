from dataclasses import dataclass


SLOT_LABELS: dict[str, str] = {
    "gk": "GK",
    "lb": "LB",
    "lcb": "LCB",
    "cb": "CB",
    "rcb": "RCB",
    "rb": "RB",
    "cdm": "CDM",
    "lcdm": "LCDM",
    "rcdm": "RCDM",
    "lm": "LM",
    "lcm": "LCM",
    "cm": "CM",
    "rcm": "RCM",
    "rm": "RM",
    "lam": "LAM",
    "cam": "CAM",
    "ram": "RAM",
    "lw": "LW",
    "lf": "LF",
    "cf": "CF",
    "rf": "RF",
    "rw": "RW",
    "ls": "LS",
    "st": "ST",
    "rs": "RS",
}


Y_ATTACK = 210
Y_SUPPORT = 380
Y_MIDFIELD = 570
Y_HOLDING = 760
Y_DEFENCE = 930


@dataclass(frozen=True)
class FormationPosition:
    key: str
    label: str
    description: str


@dataclass(frozen=True)
class FormationLayout:
    key: str
    label: str
    positions: tuple[FormationPosition, ...]
    coords: dict[str, tuple[int, int]]


def _x_positions(count: int) -> list[int]:
    if count == 1:
        return [450]
    left = 145 if count >= 4 else (220 if count == 3 else 330)
    right = 900 - left
    return [round(left + ((right - left) * index) / (count - 1)) for index in range(count)]


def _make_formation(key: str, label: str, rows: list[tuple[int, tuple[str, ...]]]) -> FormationLayout:
    coords: dict[str, tuple[int, int]] = {"gk": (450, 1120)}
    for y, slots in rows:
        xs = _x_positions(len(slots))
        for index, slot in enumerate(slots):
            coords[slot] = (xs[index], y)

    ordered_keys = ["gk", *[slot for _, slots in reversed(rows) for slot in slots]]
    positions = tuple(
        FormationPosition(key=slot, label=SLOT_LABELS[slot], description=SLOT_LABELS[slot]) for slot in ordered_keys
    )
    return FormationLayout(key=key, label=label, positions=positions, coords=coords)


FORMATIONS: dict[str, FormationLayout] = {
    "3142": _make_formation("3142", "3-1-4-2", [(Y_ATTACK, ("ls", "rs")), (Y_MIDFIELD, ("lm", "lcm", "rcm", "rm")), (Y_HOLDING, ("cdm",)), (Y_DEFENCE, ("lcb", "cb", "rcb"))]),
    "3412": _make_formation("3412", "3-4-1-2", [(Y_ATTACK, ("ls", "rs")), (Y_SUPPORT, ("cam",)), (Y_MIDFIELD, ("lm", "lcm", "rcm", "rm")), (Y_DEFENCE, ("lcb", "cb", "rcb"))]),
    "3421": _make_formation("3421", "3-4-2-1", [(Y_ATTACK, ("st",)), (Y_SUPPORT, ("lf", "rf")), (Y_MIDFIELD, ("lm", "lcm", "rcm", "rm")), (Y_DEFENCE, ("lcb", "cb", "rcb"))]),
    "343": _make_formation("343", "3-4-3", [(Y_ATTACK, ("lw", "st", "rw")), (Y_MIDFIELD, ("lm", "lcm", "rcm", "rm")), (Y_DEFENCE, ("lcb", "cb", "rcb"))]),
    "343diamond": _make_formation("343diamond", "3-4-3 Diamond", [(Y_ATTACK, ("lw", "st", "rw")), (Y_SUPPORT, ("cam",)), (Y_MIDFIELD, ("lm", "rm")), (Y_HOLDING, ("cdm",)), (Y_DEFENCE, ("lcb", "cb", "rcb"))]),
    "3511": _make_formation("3511", "3-5-1-1", [(Y_ATTACK, ("st",)), (Y_SUPPORT, ("cf",)), (Y_MIDFIELD, ("lm", "lcm", "rcm", "rm")), (Y_HOLDING, ("cdm",)), (Y_DEFENCE, ("lcb", "cb", "rcb"))]),
    "352": _make_formation("352", "3-5-2", [(Y_ATTACK, ("ls", "rs")), (Y_SUPPORT, ("cam",)), (Y_MIDFIELD, ("lm", "lcm", "rcm", "rm")), (Y_DEFENCE, ("lcb", "cb", "rcb"))]),
    "41212narrow": _make_formation("41212narrow", "4-1-2-1-2 Narrow", [(Y_ATTACK, ("ls", "rs")), (Y_SUPPORT, ("cam",)), (Y_MIDFIELD, ("lcm", "rcm")), (Y_HOLDING, ("cdm",)), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "41212wide": _make_formation("41212wide", "4-1-2-1-2 Wide", [(Y_ATTACK, ("ls", "rs")), (Y_SUPPORT, ("cam",)), (Y_MIDFIELD, ("lm", "rm")), (Y_HOLDING, ("cdm",)), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "4132": _make_formation("4132", "4-1-3-2", [(Y_ATTACK, ("ls", "rs")), (Y_MIDFIELD, ("lm", "cm", "rm")), (Y_HOLDING, ("cdm",)), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "4141": _make_formation("4141", "4-1-4-1", [(Y_ATTACK, ("st",)), (Y_MIDFIELD, ("lm", "lcm", "rcm", "rm")), (Y_HOLDING, ("cdm",)), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "4213": _make_formation("4213", "4-2-1-3", [(Y_ATTACK, ("lw", "st", "rw")), (Y_SUPPORT, ("cam",)), (Y_HOLDING, ("lcdm", "rcdm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "4222": _make_formation("4222", "4-2-2-2", [(Y_ATTACK, ("ls", "rs")), (Y_SUPPORT, ("lam", "ram")), (Y_HOLDING, ("lcdm", "rcdm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "4231": _make_formation("4231", "4-2-3-1", [(Y_ATTACK, ("st",)), (Y_SUPPORT, ("lam", "cam", "ram")), (Y_HOLDING, ("lcdm", "rcdm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "4231wide": _make_formation("4231wide", "4-2-3-1 Wide", [(Y_ATTACK, ("st",)), (Y_SUPPORT, ("cam",)), (Y_MIDFIELD, ("lm", "rm")), (Y_HOLDING, ("lcdm", "rcdm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "424": _make_formation("424", "4-2-4", [(Y_ATTACK, ("lw", "ls", "rs", "rw")), (Y_MIDFIELD, ("lcm", "rcm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "4312": _make_formation("4312", "4-3-1-2", [(Y_ATTACK, ("ls", "rs")), (Y_SUPPORT, ("cam",)), (Y_MIDFIELD, ("lcm", "cm", "rcm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "4321": _make_formation("4321", "4-3-2-1", [(Y_ATTACK, ("st",)), (Y_SUPPORT, ("lf", "rf")), (Y_MIDFIELD, ("lcm", "cm", "rcm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "433": _make_formation("433", "4-3-3", [(Y_ATTACK, ("lw", "st", "rw")), (Y_MIDFIELD, ("lcm", "cm", "rcm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "433holding": _make_formation("433holding", "4-3-3 Holding", [(Y_ATTACK, ("lw", "st", "rw")), (Y_MIDFIELD, ("lcm", "rcm")), (Y_HOLDING, ("cdm",)), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "433defend": _make_formation("433defend", "4-3-3 Defend", [(Y_ATTACK, ("lw", "st", "rw")), (Y_MIDFIELD, ("cm",)), (Y_HOLDING, ("lcdm", "rcdm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "433attack": _make_formation("433attack", "4-3-3 Attack", [(Y_ATTACK, ("lw", "st", "rw")), (Y_SUPPORT, ("cam",)), (Y_MIDFIELD, ("lcm", "rcm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "433false9": _make_formation("433false9", "4-3-3 False 9", [(Y_ATTACK, ("lw", "cf", "rw")), (Y_MIDFIELD, ("lcm", "cm", "rcm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "4411": _make_formation("4411", "4-4-1-1", [(Y_ATTACK, ("st",)), (Y_SUPPORT, ("cf",)), (Y_MIDFIELD, ("lm", "lcm", "rcm", "rm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "442": _make_formation("442", "4-4-2", [(Y_ATTACK, ("ls", "rs")), (Y_MIDFIELD, ("lm", "lcm", "rcm", "rm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "442holding": _make_formation("442holding", "4-4-2 Holding", [(Y_ATTACK, ("ls", "rs")), (Y_MIDFIELD, ("lm", "rm")), (Y_HOLDING, ("lcdm", "rcdm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "451": _make_formation("451", "4-5-1", [(Y_ATTACK, ("st",)), (Y_MIDFIELD, ("lm", "lcm", "cm", "rcm", "rm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
    "451attack": _make_formation("451attack", "4-5-1 Attack", [(Y_ATTACK, ("st",)), (Y_SUPPORT, ("lam", "cam", "ram")), (Y_HOLDING, ("lcdm", "rcdm")), (Y_DEFENCE, ("lb", "lcb", "rcb", "rb"))]),
}


def formation_keys() -> list[str]:
    return sorted(FORMATIONS.keys())


def formation_slots(formation: str) -> list[str]:
    layout = FORMATIONS.get(formation)
    if layout is None:
        return []
    return [position.key for position in layout.positions]


def slots_by_formation() -> dict[str, list[str]]:
    return {key: formation_slots(key) for key in formation_keys()}
