#!/usr/bin/env python3
"""Génère les stickers du chat (public/emotes/*.svg) et leur liste (public/emotes.js).
Dessins originaux, style « emote » : contour épais, couleurs vives, lisibles en 24 px.
Pour en ajouter un : écrire une fonction qui renvoie le SVG intérieur, l'ajouter à EMOTES, relancer :
    python3 tools/make-emotes.py
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
OUT = os.path.join(ROOT, 'emotes')
INK = '#14141a'
SW = 3.2  # épaisseur du contour

def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">{body}</svg>'

# ---------- briques pour les visages ----------
def face(fill='#ffcc33', shade='#f0a020'):
    return (f'<circle cx="32" cy="33" r="27" fill="{fill}" stroke="{INK}" stroke-width="{SW}"/>'
            f'<path d="M12 42a27 27 0 0 0 40 0a24 24 0 0 1-40 0z" fill="{shade}" opacity=".55"/>'
            f'<ellipse cx="22" cy="17" rx="7" ry="3.5" fill="#fff" opacity=".45" transform="rotate(-25 22 17)"/>')

def eyes_dot(y=28, dx=9, r=3.6):
    return f'<circle cx="{32-dx}" cy="{y}" r="{r}" fill="{INK}"/><circle cx="{32+dx}" cy="{y}" r="{r}" fill="{INK}"/>'

def eyes_happy(y=29):  # ^ ^
    return (f'<path d="M18 {y+2}q5-7 10 0M36 {y+2}q5-7 10 0" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>')

def eyes_closed(y=30):  # - -
    return f'<path d="M18 {y}q5 4 10 0M36 {y}q5 4 10 0" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>'

def eyes_big(y=29):  # grands yeux brillants
    out = ''
    for cx in (23, 41):
        out += (f'<circle cx="{cx}" cy="{y}" r="7.5" fill="#fff" stroke="{INK}" stroke-width="2.4"/>'
                f'<circle cx="{cx+1}" cy="{y+1}" r="5" fill="{INK}"/>'
                f'<circle cx="{cx+2.6}" cy="{y-1.4}" r="1.9" fill="#fff"/><circle cx="{cx-1}" cy="{y+3}" r="1" fill="#fff"/>')
    return out

def eyes_wide(y=27):  # yeux ronds (choc)
    return (f'<circle cx="23" cy="{y}" r="6.5" fill="#fff" stroke="{INK}" stroke-width="2.4"/><circle cx="23" cy="{y}" r="2.4" fill="{INK}"/>'
            f'<circle cx="41" cy="{y}" r="6.5" fill="#fff" stroke="{INK}" stroke-width="2.4"/><circle cx="41" cy="{y}" r="2.4" fill="{INK}"/>')

def heart(cx, cy, s=1.0, fill='#ff3b5c'):
    return (f'<path transform="translate({cx} {cy}) scale({s})" d="M0 6C-9-1-8-9-3-9c2 0 3 1 3 3c0-2 1-3 3-3c5 0 6 8-3 15z" '
            f'fill="{fill}" stroke="{INK}" stroke-width="{2.2/s:.2f}" stroke-linejoin="round"/>')

def brows_angry():
    return f'<path d="M15 20l11 5M49 20l-11 5" stroke="{INK}" stroke-width="{SW+0.6}" stroke-linecap="round"/>'

def tear(x, y, flip=False):
    sx = -1 if flip else 1
    return (f'<path transform="translate({x} {y}) scale({sx} 1)" d="M0 0c-4 6-6 9-6 12a6 6 0 0 0 12 0c0-3-2-6-6-12z" '
            f'fill="#4fc3ff" stroke="{INK}" stroke-width="2"/>')

def mouth(kind):
    m = {
        'smile': f'<path d="M20 40q12 11 24 0" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>',
        'grin': f'<path d="M17 37q15 1 30 0q-2 15-15 15t-15-15z" fill="#5a1020" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
                f'<path d="M19.5 38.5q12.5 1 25 0l-1 3.5q-11.5 1-23 0z" fill="#fff"/><path d="M26 48q6-4 12 0q-6 4-12 0z" fill="#ff6b81"/>',
        'frown': f'<path d="M22 47q10-9 20 0" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>',
        'o': f'<ellipse cx="32" cy="45" rx="5.5" ry="7" fill="#5a1020" stroke="{INK}" stroke-width="{SW}"/>',
        'flat': f'<path d="M23 44h18" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>',
        'smirk': f'<path d="M22 44q11 4 21-5" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>',
        'teeth': f'<rect x="19" y="39" width="26" height="10" rx="4" fill="#fff" stroke="{INK}" stroke-width="{SW}"/>'
                 f'<path d="M25.5 39v10M32 39v10M38.5 39v10M19 44h26" stroke="{INK}" stroke-width="1.6"/>',
        'small': f'<path d="M28 45q4 3 8 0" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>',
        'wavy': f'<path d="M20 45q3-3 6 0t6 0t6 0t6 0" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>',
    }
    return m[kind]

def badge(text, fill, fg='#fff', size=None):
    size = size or (26 if len(text) <= 2 else 17 if len(text) <= 4 else 13.5)
    return (f'<rect x="4" y="12" width="56" height="40" rx="12" fill="{fill}" stroke="{INK}" stroke-width="{SW}"/>'
            f'<rect x="9" y="16" width="30" height="5" rx="2.5" fill="#fff" opacity=".35"/>'
            f'<text x="32" y="{32 + size * 0.36:.1f}" text-anchor="middle" font-family="Arial Black,Impact,Arial,sans-serif" font-weight="900" '
            f'font-size="{size}" fill="{fg}" stroke="{INK}" stroke-width="1.6" paint-order="stroke" letter-spacing="0.5">{text}</text>')

# ---------- les stickers ----------
def poing():  # poing levé, vu de face
    out = f'<rect x="22" y="44" width="20" height="17" rx="3" fill="#d92b22" stroke="{INK}" stroke-width="{SW}"/>'
    out += f'<rect x="13" y="22" width="38" height="28" rx="10" fill="#ff3b30" stroke="{INK}" stroke-width="{SW}"/>'
    for x in (13, 22.5, 32, 41.5):
        out += f'<rect x="{x}" y="9" width="9.5" height="20" rx="4.75" fill="#ff3b30" stroke="{INK}" stroke-width="{SW}"/>'
        out += f'<path d="M{x+2.5} 13v5" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".5"/>'
    out += f'<path d="M11 33c0-3 2-5 5-5h17c3 0 5 2 5 5s-2 5-5 5H16c-3 0-5-2-5-5z" fill="#ff5a4f" stroke="{INK}" stroke-width="{SW}"/>'
    out += f'<path d="M26 54h12" stroke="{INK}" stroke-width="2" stroke-linecap="round" opacity=".5"/>'
    return out

def megaphone():
    return (f'<path d="M10 26h9l25-14v40L19 38h-9z" fill="#ff9f0a" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            f'<rect x="7" y="25" width="7" height="14" rx="2.5" fill="#fff" stroke="{INK}" stroke-width="{SW}"/>'
            f'<path d="M21 38l3 13h7l-2-11" fill="#ff9f0a" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            f'<path d="M50 23q5 9 0 18M55 18q8 14 0 28" fill="none" stroke="#ff3b30" stroke-width="3.4" stroke-linecap="round"/>'
            '<path d="M22 28l18-10" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>')

def mdr():
    return face() + eyes_happy(27) + mouth('grin') + tear(9, 24) + tear(55, 24, True)

def ptdr():  # crâne : mort de rire
    return (f'<path d="M32 6c-14 0-24 9-24 22c0 8 4 13 9 16v8c0 3 2 5 5 5h20c3 0 5-2 5-5v-8c5-3 9-8 9-16C56 15 46 6 32 6z" fill="#f2f2f7" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            f'<path d="M14 26q6-6 12 1q-6 7-12-1zM38 27q6-7 12-1q-6 8-12 1z" fill="{INK}"/>'
            f'<path d="M29 37l3-5l3 5z" fill="{INK}"/><path d="M25 50v6M32 50v7M39 50v6" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>'
            '<ellipse cx="22" cy="14" rx="6" ry="3" fill="#fff" transform="rotate(-25 22 14)"/>')

def cheh():
    return (face('#b6f36b', '#7fcf3a') + f'<path d="M17 28h11M36 28h11" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>'
            f'<path d="M20 26.5a3.5 3 0 0 0 7 0M38 26.5a3.5 3 0 0 0 7 0" fill="{INK}"/>' + mouth('smirk')
            + f'<path d="M15 19l12 2M37 21l12-4" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>')

def grr():
    return face('#ff5a4f', '#d7322a') + brows_angry() + eyes_dot(30, 9, 3.4) + mouth('teeth') + '<path d="M50 8l4-5M56 13l5-3M45 6l1-5" stroke="#ff3b30" stroke-width="3" stroke-linecap="round"/>'

def love():
    return face('#ffb3c7', '#ff7aa2') + heart(22, 28, 0.95) + heart(42, 28, 0.95) + mouth('smile')

def choc():
    return face('#9ad7ff', '#5cb3f0') + eyes_wide(27) + mouth('o') + f'<path d="M14 15l6 3M50 15l-6 3" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>'

def snif():
    return face('#8fb9ff', '#5d8de6') + f'<path d="M17 24l9-3M47 24l-9-3" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>' + eyes_dot(30, 9, 3.2) + mouth('frown') + tear(43, 34)

def hmm():
    return (face() + f'<path d="M16 22q5-5 11-1" fill="none" stroke="{INK}" stroke-width="2.8" stroke-linecap="round"/>'
            f'<path d="M37 25h11" stroke="{INK}" stroke-width="2.8" stroke-linecap="round"/>' + eyes_dot(30, 9, 3.2) + mouth('wavy')
            + f'<text x="54" y="18" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="20" fill="#0a84ff" stroke="{INK}" stroke-width="1.4" paint-order="stroke">?</text>')

def flemme():
    return (face('#e0d4ff', '#b8a4f0') + eyes_closed(31) + mouth('small')
            + f'<text x="49" y="18" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="15" fill="#bf5af2" stroke="{INK}" stroke-width="1.2" paint-order="stroke">z</text>'
            + f'<text x="55" y="9" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="11" fill="#bf5af2" stroke="{INK}" stroke-width="1" paint-order="stroke">z</text>'
            + '<circle cx="24" cy="42" r="2.5" fill="#9ad7ff"/>')

def sigma():
    return (face() + f'<path d="M12 24h40l-2 9c-1 4-4 6-8 6h-4c-3 0-5-2-6-5c-1 3-3 5-6 5h-4c-4 0-7-2-8-6z" fill="{INK}"/>'
            '<path d="M17 27l6 0M38 27l6 0" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>' + mouth('smirk'))

def pls():
    return face() + f'<path d="M16 21q5-4 10 0M38 21q5-4 10 0" fill="none" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>' + eyes_big(31) + mouth('small')

def clown():
    return (face('#fff7ef', '#f1d9c4') + '<path d="M6 26q-2-10 8-14q-6 8-1 14zM58 26q2-10-8-14q6 8 1 14z" fill="#ff3b30"/>'
            + eyes_dot(27, 10, 3) + f'<circle cx="32" cy="35" r="5" fill="#ff3b30" stroke="{INK}" stroke-width="2.2"/>'
            + f'<path d="M19 43q13 12 26 0" fill="#ff3b30" stroke="{INK}" stroke-width="2.6"/>'
            + '<path d="M18 22l5-6l5 6M36 22l5-6l5 6" fill="none" stroke="#0a84ff" stroke-width="2"/>')

def gg():
    return badge('GG', '#ffd60a', '#ffd60a') .replace('fill="#ffd60a" stroke', 'fill="#1f8b4c" stroke', 1)

def ratio():
    return badge('RATIO', '#ff3b30')

def wsh():
    return badge('WSH', '#0a84ff')

def plus1():
    return badge('+1', '#30d158')

def croissant():
    return (f'<path d="M5 47Q7 13 32 11Q57 13 59 47Q53 52 46 47Q45 30 32 29Q19 30 18 47Q11 52 5 47z" fill="#f4a63a" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            f'<path d="M15 21l9 11M32 12v17M49 21l-9 11M8 34l11 4M56 34l-11 4" stroke="#b86b14" stroke-width="2.6" stroke-linecap="round"/>'
            '<path d="M17 19q7-6 14-6" stroke="#ffe0a8" stroke-width="3" stroke-linecap="round" fill="none"/>')

def cafe():
    return (f'<path d="M12 28h34v14c0 9-7 14-17 14S12 51 12 42z" fill="#fff" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            f'<path d="M46 32h3c5 0 7 3 7 6s-2 7-8 7h-3" fill="none" stroke="{INK}" stroke-width="{SW}"/>'
            f'<ellipse cx="29" cy="28" rx="17" ry="4" fill="#7a4a24" stroke="{INK}" stroke-width="2.4"/>'
            '<path d="M22 20q-4-5 0-9q4-4 0-8M31 20q-4-5 0-9q4-4 0-8M40 20q-4-5 0-9" fill="none" stroke="#c7c7cc" stroke-width="2.6" stroke-linecap="round"/>'
            '<path d="M10 58h40" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/><path d="M17 36v8" stroke="#e5e5ea" stroke-width="3" stroke-linecap="round"/>')

def tram():
    return (f'<rect x="12" y="8" width="40" height="46" rx="12" fill="#ff3b30" stroke="{INK}" stroke-width="{SW}"/>'
            f'<rect x="17" y="15" width="30" height="18" rx="5" fill="#9ad7ff" stroke="{INK}" stroke-width="2.4"/>'
            '<path d="M20 18l8 0" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>'
            f'<circle cx="21" cy="43" r="3.5" fill="#ffd60a" stroke="{INK}" stroke-width="2"/><circle cx="43" cy="43" r="3.5" fill="#ffd60a" stroke="{INK}" stroke-width="2"/>'
            f'<rect x="27" y="39" width="10" height="7" rx="2" fill="#fff" stroke="{INK}" stroke-width="2"/>'
            f'<text x="32" y="45" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="6.5" fill="{INK}">T1</text>'
            f'<path d="M24 4h16M32 4v4M16 54l-5 7M48 54l5 7" stroke="{INK}" stroke-width="{SW}" stroke-linecap="round"/>')

def bloque():
    return (f'<path d="M20 6h24l14 14v24L44 58H20L6 44V20z" fill="#ff3b30" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            '<path d="M22 22l20 20M42 22L22 42" stroke="#fff" stroke-width="7" stroke-linecap="round"/>'
            f'<path d="M22 22l20 20M42 22L22 42" stroke="{INK}" stroke-width="1.5" stroke-linecap="round" opacity=".25"/>'
            '<path d="M21 11h14" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>')

def ouvert():
    return (f'<circle cx="32" cy="32" r="26" fill="#30d158" stroke="{INK}" stroke-width="{SW}"/>'
            '<path d="M19 33l9 9l17-19" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
            '<ellipse cx="22" cy="16" rx="7" ry="3.2" fill="#fff" opacity=".45" transform="rotate(-25 22 16)"/>')

def feu():
    return (f'<path d="M32 4c3 10 15 15 15 31c0 12-7 21-15 21s-17-7-17-19c0-9 6-13 7-20c4 4 5 8 5 12c3-7 5-14 5-25z" fill="#ff6a00" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            '<path d="M32 26c2 7 8 9 8 18c0 6-4 10-8 10s-9-4-9-10c0-5 3-7 4-11c2 2 3 4 3 7c1-4 2-8 2-14z" fill="#ffd60a"/>')

def coeur():
    return (f'<path d="M32 56C10 41 5 30 5 21C5 12 12 7 19 7c6 0 10 4 13 9c3-5 7-9 13-9c7 0 14 5 14 14c0 9-5 20-27 35z" '
            f'fill="#ff2d55" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            '<path d="M14 17q2-5 7-5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".6"/>')

def popcorn():
    return (f'<path d="M14 26h36l-5 32H19z" fill="#fff" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            '<path d="M21 27l3 30M32 27v30M43 27l-3 30" stroke="#ff3b30" stroke-width="4.5"/>'
            f'<path d="M14 26h36l-5 32H19z" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            + ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff4c2" stroke="{INK}" stroke-width="2"/>' for x, y, r in
                      [(17, 22, 5.5), (26, 18, 6.5), (37, 18, 6.5), (47, 22, 5.5), (31, 11, 6), (21, 12, 4.5), (42, 11, 4.5)]))

def vote():
    return (f'<rect x="20" y="4" width="24" height="24" rx="3" fill="#fff" stroke="{INK}" stroke-width="2.6" transform="rotate(8 32 16)"/>'
            '<path d="M26 16l4 4l8-9" fill="none" stroke="#30d158" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" transform="rotate(8 32 16)"/>'
            f'<rect x="8" y="26" width="48" height="32" rx="6" fill="#0a84ff" stroke="{INK}" stroke-width="{SW}"/>'
            f'<rect x="18" y="25" width="28" height="6" rx="3" fill="{INK}"/>'
            '<path d="M14 36h12" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>')

def pave():
    return (f'<path d="M32 8L56 20v24L32 56L8 44V20z" fill="#8e8e93" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            f'<path d="M8 20l24 12l24-12M32 32v24" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            '<path d="M32 8L56 20L32 32L8 20z" fill="#c7c7cc"/><path d="M8 20L32 32v24L8 44z" fill="#aeaeb2"/>'
            f'<path d="M32 8L56 20v24L32 56L8 44V20zM8 20l24 12l24-12M32 32v24" fill="none" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            '<path d="M18 21l14-7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>'
            '<circle cx="44" cy="40" r="1.6" fill="#636366"/><circle cx="19" cy="40" r="1.4" fill="#636366"/>')

def lacry():  # nuage de lacrymo qui pleure
    return (f'<path d="M14 46c-6 0-10-4-10-9s4-9 9-9c1-8 7-14 15-14c6 0 11 3 13 8c2-1 4-2 6-2c7 0 12 5 12 12c0 8-5 14-12 14z" '
            f'fill="#d1d1d6" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            f'<path d="M20 31q4-3 8 0M36 31q4-3 8 0" fill="none" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>'
            f'<path d="M26 40q6-4 12 0" fill="none" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>'
            + tear(22, 46) + tear(42, 46))

def banderole():
    return (f'<path d="M10 8v52M54 8v52" stroke="#7a4a24" stroke-width="5" stroke-linecap="round"/>'
            f'<path d="M10 8v52M54 8v52" stroke="{INK}" stroke-width="1.6" stroke-linecap="round" opacity=".4"/>'
            f'<path d="M10 14q22 6 44 0v26q-22 6-44 0z" fill="#fff" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>'
            '<path d="M16 24q16 4 32 0M16 31q16 4 32 0" stroke="#ff3b30" stroke-width="4" stroke-linecap="round"/>')

def solidaire():  # deux mains qui se serrent
    return (f'<circle cx="32" cy="32" r="27" fill="#bf5af2" stroke="{INK}" stroke-width="{SW}"/>'
            f'<path d="M10 34l9-10l9 3l7-4l8 2l11 9l-8 9l-6 5c-2 2-5 2-6 0l-2-2l-2 1c-2 1-4 0-5-2l-2 0c-2 0-3-1-4-3z" fill="#ffcc99" stroke="{INK}" stroke-width="2.6" stroke-linejoin="round"/>'
            f'<path d="M28 27l-6 7c-1 2 1 4 3 3l7-5M33 36l6 5M30 39l5 4M27 41l3 3" fill="none" stroke="{INK}" stroke-width="2.2" stroke-linecap="round"/>')

EMOTES = [
    ('poing', 'Poing levé', poing), ('megaphone', 'Mégaphone', megaphone), ('banderole', 'Banderole', banderole), ('pave', 'Pavé', pave),
    ('bloque', 'Bloqué', bloque), ('ouvert', 'Ouvert', ouvert), ('vote', 'Vote', vote), ('solidaire', 'Solidarité', solidaire),
    ('tram', 'Tram', tram), ('lacry', 'Lacrymo', lacry), ('feu', 'Le feu', feu), ('coeur', 'Cœur', coeur),
    ('mdr', 'MDR', mdr), ('ptdr', 'PTDR', ptdr), ('cheh', 'Cheh', cheh), ('grr', 'Grr', grr),
    ('love', 'Love', love), ('choc', 'Choc', choc), ('snif', 'Snif', snif), ('hmm', 'Hmm', hmm),
    ('flemme', 'Flemme', flemme), ('sigma', 'Sigma', sigma), ('pls', 'Steuplé', pls), ('clown', 'Clown', clown),
    ('gg', 'GG', gg), ('ratio', 'Ratio', ratio), ('wsh', 'Wesh', wsh), ('plus1', '+1', plus1),
    ('croissant', 'Croissant', croissant), ('cafe', 'Café', cafe), ('popcorn', 'Popcorn', popcorn),
]

os.makedirs(OUT, exist_ok=True)
for code, label, fn in EMOTES:
    with open(os.path.join(OUT, f'{code}.svg'), 'w') as f:
        f.write(svg(fn()))
with open(os.path.join(ROOT, 'emotes.js'), 'w') as f:
    f.write('// Généré par tools/make-emotes.py : stickers du chat, s\'écrivent :code: dans un message.\n')
    f.write('export const EMOTES = ' + json.dumps([{'code': c, 'label': l} for c, l, _ in EMOTES], ensure_ascii=False) + ';\n')
print(len(EMOTES), 'stickers générés')
