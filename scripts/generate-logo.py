#!/usr/bin/env python3
"""
Gera os ícones do LinguaCards a partir de uma única definição geométrica.

O logo é um "F" branco dentro de um quadrado azul de cantos arredondados. O F
é desenhado com retângulos, não com uma fonte: assim ele fica idêntico em
qualquer máquina, tem espessura constante e continua legível a 48 pixels, onde
o traço fino de uma fonte de texto some.

Uso:
    python3 scripts/generate-logo.py

Reescreve tudo em assets/. Manter o gerador versionado significa que o logo é
reproduzível — para mudar a cor ou a espessura, edite aqui e rode de novo, em
vez de abrir um editor de imagem.
"""

from PIL import Image, ImageDraw

# Azul primário do app (src/theme/index.ts).
BLUE = (91, 141, 239, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

# Fator de suavização: desenha grande e reduz, para as bordas saírem limpas.
SUPERSAMPLE = 4


def rounded_square(size: int, color, radius_ratio: float = 0.225) -> Image.Image:
    """Quadrado de cantos arredondados, na proporção usada por ícones de app."""
    canvas = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=int(size * radius_ratio),
        fill=color,
    )
    return canvas


def draw_f(canvas: Image.Image, color, scale: float = 0.46) -> None:
    """
    Desenha o F centrado, a partir de três barras.

    As proporções foram escolhidas para o desenho não parecer nem um E sem a
    barra de baixo nem um T deslocado: a barra do meio é mais curta que a de
    cima, e o vão entre elas é maior que a espessura do traço.
    """
    size = canvas.width
    draw = ImageDraw.Draw(canvas)

    height = size * scale
    width = height * 0.66
    thickness = height * 0.20
    # Raio pequeno nas pontas, ecoando o arredondamento do quadrado.
    radius = thickness * 0.22

    # Centro óptico: o F tem massa à esquerda, então recuar um pouco o desenho
    # faz ele parecer centrado mesmo não estando no centro geométrico.
    left = (size - width) / 2 - width * 0.04
    top = (size - height) / 2

    def bar(x0, y0, x1, y1):
        draw.rounded_rectangle([(x0, y0), (x1, y1)], radius=radius, fill=color)

    # Haste vertical.
    bar(left, top, left + thickness, top + height)
    # Braço superior, indo até a largura total.
    bar(left, top, left + width, top + thickness)
    # Braço do meio, mais curto, logo abaixo da metade.
    mid_top = top + height * 0.42
    bar(left, mid_top, left + width * 0.80, mid_top + thickness)


def render(size: int, *, background: bool, mark: bool, mark_color=WHITE, scale=0.46) -> Image.Image:
    """Monta um ícone no tamanho pedido, com ou sem fundo e sem ou com o F."""
    big = size * SUPERSAMPLE
    canvas = (
        rounded_square(big, BLUE) if background else Image.new("RGBA", (big, big), TRANSPARENT)
    )
    if mark:
        draw_f(canvas, mark_color, scale=scale)
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    outputs = {
        # Ícone principal: quadrado azul com o F.
        "assets/icon.png": render(1024, background=True, mark=True),
        # Splash: mesmo desenho; o fundo da tela vem do app.json.
        "assets/splash-icon.png": render(1024, background=True, mark=True),
        "assets/favicon.png": render(48, background=True, mark=True),
        # Android usa camadas separadas. O primeiro plano precisa caber na
        # zona segura (o sistema recorta as bordas em máscaras redondas), por
        # isso o F sai menor aqui do que no ícone comum.
        "assets/android-icon-background.png": render(1024, background=True, mark=False),
        "assets/android-icon-foreground.png": render(1024, background=False, mark=True, scale=0.30),
        # Ícone monocromático dos temas do Android 13+: só a silhueta.
        "assets/android-icon-monochrome.png": render(
            1024, background=False, mark=True, mark_color=WHITE, scale=0.30
        ),
    }

    for path, image in outputs.items():
        image.save(path)
        print(f"{path}  {image.width}x{image.height}")


if __name__ == "__main__":
    main()
