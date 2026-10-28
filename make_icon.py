"""Рисует icon.ico: скруглённый квадрат с градиентом и буквами D2."""
from PIL import Image, ImageDraw, ImageFont

S = 256
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
grad = Image.new("RGBA", (S, S))
px = grad.load()
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        px[x, y] = (255, int(90 + 65 * t), int(60 - 20 * t), 255)  # от #ff5a3c к #ff9b28
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((8, 8, S - 8, S - 8), radius=56, fill=255)
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 130)
except OSError:
    font = ImageFont.load_default()
d.text((S / 2, S / 2 + 4), "D2", font=font, fill=(26, 13, 8, 255), anchor="mm")
img.save("icon.ico", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
