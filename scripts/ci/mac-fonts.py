"""CI(리눅스)에서 맥 글꼴 이름을 흉내 낸다.

연구 서식(preamble)은 맥 기본 글꼴 AppleMyungjo, Apple SD Gothic Neo를 쓴다. 리눅스에는 없으므로
나눔 글꼴을 그 이름으로 바꿔 ~/.fonts에 둔다. 컴파일 테스트만을 위한 것이고 앱 동작은 바꾸지 않는다.
"""
import os
from fontTools.ttLib import TTFont

NANUM = '/usr/share/fonts/truetype/nanum'
out = os.path.expanduser('~/.fonts')
os.makedirs(out, exist_ok=True)
for src, family in [('NanumMyeongjo.ttf', 'AppleMyungjo'), ('NanumGothic.ttf', 'Apple SD Gothic Neo')]:
    font = TTFont(os.path.join(NANUM, src))
    for rec in font['name'].names:
        if rec.nameID in (1, 4, 16):
            rec.string = family
        elif rec.nameID == 6:
            rec.string = family.replace(' ', '')
    font.save(os.path.join(out, family.replace(' ', '') + '.ttf'))
    print(f'{src} -> {family}')
