# kit.py — la identidad de @manoamano.desafio en archivos: logo, avatar, portadas de destacados, plantillas de posteos
# y de historias (1080×1350 y 1080×1920). Todo dibujado acá, sin imágenes de terceros.
import os, math
from PIL import Image, ImageDraw, ImageFont
AQUI = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(AQUI, 'redes'); os.makedirs(OUT, exist_ok=True)
F = lambda n, w='Bold': ImageFont.truetype(f'/usr/share/fonts/truetype/google-fonts/Poppins-{w}.ttf', n)
TINTA, PAPEL, CREMA = '#14110F', '#F6F1EA', '#F3EEE6'
FUTBOL, TENIS, NBA, ACIERTO, ERROR, GRIS = '#177A40', '#DFF140', '#E8731C', '#3ED17A', '#FF6B5B', '#A69D92'
ICO = Image.open(os.path.join(AQUI, 'icono-transparente-1024.png')).convert('RGBA')     # la M y la pelota, sin fondo: para fondos oscuros
LOSETA = Image.open(os.path.join(AQUI, 'loseta-1024.png')).convert('RGBA')              # la loseta entera: para fondos claros o de color

def tx(d, xy, t, f, fill, anchor='la'): d.text(xy, t, font=f, fill=fill, anchor=anchor)
def centrado(d, y, t, f, fill): d.text((540, y), t, font=f, fill=fill, anchor='ma')
def pelotas(im, x, y, s, loseta=False): ic = (LOSETA if loseta else ICO).resize((s, s), Image.LANCZOS); im.paste(ic, (x, y), ic)
def pie(d, im, y, oscuro=True):
    pelotas(im, 60, y - 6, 56, loseta=not oscuro); tx(d, (130, y), 'Mano a mano', F(34), '#fff' if oscuro else TINTA)
    tx(d, (1020, y + 4), '@manoamano.desafio', F(28, 'Medium'), GRIS, 'ra')
def chip(d, x, y, t, color, f, pad=22):
    w = d.textlength(t, font=f) + pad * 2; d.rounded_rectangle([x, y, x + w, y + f.size + 24], 999, fill=color); tx(d, (x + pad, y + 10), t, f, TINTA if color in (TENIS, '#fff', PAPEL) else '#fff'); return w

# ── 1. el logo horizontal, en oscuro y en claro ──
for nombre, fondo, color in [('logo-oscuro', TINTA, '#fff'), ('logo-claro', PAPEL, TINTA)]:
    im = Image.new('RGB', (1600, 440), fondo); d = ImageDraw.Draw(im); pelotas(im, 80, 70, 300, loseta=(fondo != TINTA)); tx(d, (420, 118), 'Mano a mano', F(150, 'ExtraBold') if os.path.exists('/usr/share/fonts/truetype/google-fonts/Poppins-ExtraBold.ttf') else F(150), color)
    tx(d, (426, 300), 'Desafiá a tus amigos: fútbol, tenis y NBA', F(44, 'Medium'), GRIS); im.save(os.path.join(OUT, nombre + '.png'))
# ── 2. el avatar (círculo seguro) ──
im = Image.new('RGB', (1080, 1080), TINTA); pelotas(im, 90, 90, 900); im.save(os.path.join(OUT, 'avatar-1080.png'))
# ── 3. portadas de destacados ──
for t, c in [('Desafíos', '#fff'), ('Juegos', TENIS), ('Fútbol', FUTBOL), ('Tenis', TENIS), ('NBA', NBA), ('Cómo jugar', '#fff')]:
    im = Image.new('RGB', (1080, 1920), TINTA); d = ImageDraw.Draw(im); d.ellipse([340, 760, 740, 1160], fill=c if c != '#fff' else '#2A2520'); pelotas(im, 440, 860, 200, loseta=True)
    centrado(d, 1240, t, F(76), '#fff'); im.save(os.path.join(OUT, f'destacado-{t.lower().replace(" ", "-").replace("ó","o").replace("ú","u")}.png'))

# ── 4. plantilla: el desafío de la fecha (post 1080×1350) ──
def post_desafio(nombre, partidos, codigo, archivo):
    im = Image.new('RGB', (1080, 1350), TINTA); d = ImageDraw.Draw(im)
    tx(d, (70, 90), 'DESAFÍO DE LA SEMANA', F(30), NBA); tx(d, (70, 140), nombre, F(74), '#fff')
    tx(d, (70, 240), '¿Quién gana? Elegí. Todos a ciegas. Un punto por partido.', F(32, 'Medium'), GRIS)
    y = 340
    for dep, local, visita, cuando in partidos:
        col = {'futbol': FUTBOL, 'tenis': TENIS, 'nba': NBA}[dep]
        d.rounded_rectangle([70, y, 1010, y + 150], 28, fill='#201B18'); d.ellipse([100, y + 60, 130, y + 90], fill=col)
        tx(d, (160, y + 30), f'{local} – {visita}', F(44), '#fff'); tx(d, (160, y + 92), cuando, F(28, 'Medium'), GRIS); y += 170
    d.rounded_rectangle([70, 1080, 1010, 1200], 30, fill=TENIS); tx(d, (100, 1108), 'Entrá con el código', F(36, 'Medium'), TINTA); tx(d, (980, 1098), codigo, F(60), TINTA, 'ra')
    pie(d, im, 1270); im.save(os.path.join(OUT, archivo))
post_desafio('Finde largo', [('futbol', 'Talleres', 'Belgrano', 'sáb 15:00 · Liga Profesional'), ('tenis', 'Sinner', 'Alcaraz', 'dom 10:30 · Shanghai, final'), ('nba', 'Boston', 'Denver', 'mar 21:30 · NBA')], 'K7M2PQ', 'plantilla-post-desafio.png')

# ── 5. plantilla: el modelo dijo / lo que pasó (post) ──
def post_modelo(partido, dijo, paso, acerto, archivo):
    im = Image.new('RGB', (1080, 1350), PAPEL); d = ImageDraw.Draw(im)
    tx(d, (70, 90), 'EL MODELO DIJO', F(30), '#C2542E'); tx(d, (70, 140), partido, F(70), TINTA)
    d.rounded_rectangle([70, 300, 1010, 640], 36, fill=TINTA); tx(d, (110, 340), 'antes del partido', F(30, 'Medium'), GRIS); tx(d, (110, 400), dijo, F(110), '#fff')
    d.rounded_rectangle([70, 680, 1010, 1020], 36, fill=ACIERTO if acerto else ERROR); tx(d, (110, 720), 'lo que pasó', F(30, 'Medium'), TINTA); tx(d, (110, 780), paso, F(110), TINTA)
    tx(d, (70, 1090), '¿Vos qué habías elegido? Jugá contra el modelo en la app.', F(34, 'Medium'), GRIS)
    pie(d, im, 1270, oscuro=False); im.save(os.path.join(OUT, archivo))
post_modelo('Sinner – Alcaraz', 'Sinner 54%', 'Ganó Alcaraz', False, 'plantilla-post-modelo.png')

# ── 6. plantilla: resultado del juego (historia 1080×1920) ──
def historia_juego(titulo, marcador, sub, archivo, color=FUTBOL):
    im = Image.new('RGB', (1080, 1920), TINTA); d = ImageDraw.Draw(im)
    d.rounded_rectangle([90, 420, 990, 1300], 60, fill=color if color != TENIS else '#2A2520')
    centrado(d, 500, titulo.upper(), F(40), '#fff'); centrado(d, 640, marcador, F(220), '#fff'); centrado(d, 960, sub, F(44, 'Medium'), '#fff')
    centrado(d, 1120, '¿Me superás?', F(60), TENIS)
    centrado(d, 1420, 'Jugá gratis en Mano a mano', F(44, 'Medium'), GRIS); pelotas(im, 490, 1500, 100); centrado(d, 1640, '@manoamano.desafio', F(36, 'Medium'), GRIS)
    im.save(os.path.join(OUT, archivo))
historia_juego('Penales vs el modelo', '4 – 2', 'cinco penales, cinco atajadas', 'plantilla-historia-penales.png')
historia_juego('Triples en un minuto', '27', 'puntos · racha de 5', 'plantilla-historia-triples.png', NBA)

# ── 7. plantilla: ¿quién gana? (historia con encuesta) ──
im = Image.new('RGB', (1080, 1920), TINTA); d = ImageDraw.Draw(im)
centrado(d, 300, '¿QUIÉN GANA?', F(40), NBA); centrado(d, 380, 'Boston – Denver', F(84), '#fff'); centrado(d, 500, 'martes 21:30 · NBA', F(34, 'Medium'), GRIS)
d.rounded_rectangle([140, 700, 940, 860], 40, fill='#2A2520'); centrado(d, 740, 'acá va la encuesta', F(44, 'Medium'), GRIS)
centrado(d, 1000, 'El modelo ya eligió. Lo mostramos cuando empiece.', F(36, 'Medium'), '#fff'); pelotas(im, 490, 1500, 100); centrado(d, 1640, '@manoamano.desafio', F(36, 'Medium'), GRIS)
im.save(os.path.join(OUT, 'plantilla-historia-quien-gana.png'))

# ── 8. grilla: la primera fila del feed (3 posteos de presentación) ──
for i, (t1, t2, fondo, col) in enumerate([('Una app.', 'Tres deportes.', TINTA, '#fff'), ('Desafiá', 'a tus amigos.', FUTBOL, '#fff'), ('Jugá contra', 'el modelo.', TENIS, TINTA)]):
    im = Image.new('RGB', (1080, 1350), fondo); d = ImageDraw.Draw(im); centrado(d, 480, t1, F(110), col); centrado(d, 610, t2, F(110), col)
    pelotas(im, 440, 820, 200, loseta=(fondo != TINTA)); centrado(d, 1080, 'Mano a mano · gratis', F(40, 'Medium'), col); im.save(os.path.join(OUT, f'post-presentacion-{i + 1}.png'))
print('listo', len(os.listdir(OUT)), 'archivos')
