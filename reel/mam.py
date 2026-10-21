# mam.py — los reels de Mano a mano (@manoamano.desafio): desafios · simulaciones · juegos · tres · modelo. 1080×1920, 30 fps.
# La app se graba de verdad (app/www-prueba, con el reloj controlado cuadro a cuadro y el servidor simulado).
# Ritmo propio sintetizado, sin música de terceros.   python3 mam.py desafios | simulaciones | juegos | tres | modelo | presentacion | todos
import os, io, math, json, wave, shutil, subprocess, time, base64, sys, threading, http.server, socketserver, functools
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__)); WWW = os.path.join(AQUI, '..', 'app', 'www-prueba')
FPS, W, H = 30, 1080, 1920
PAPEL, TINTA, FUTBOL, TENIS, NBA, GRIS, CREMA = '#F6F1EA', '#14110F', '#177A40', '#DFF140', '#E8731C', '#A69D92', '#F3EEE6'
F = lambda n, w='Bold': ImageFont.truetype(f'/usr/share/fonts/truetype/google-fonts/Poppins-{w}.ttf', n)
ICO = Image.open(os.path.join(AQUI, '..', 'marca', 'icono-transparente-1024.png')).convert('RGBA')
ease = lambda t: 1 - (1 - max(0, min(1, t))) ** 3

class Reel:
    def __init__(self, nombre):
        self.nombre = nombre; self.CU = os.path.join(AQUI, 'cuadros-' + nombre); shutil.rmtree(self.CU, ignore_errors=True); os.makedirs(self.CU)
        self.n = 0; self.cortes = []; self.guion = []
    def guardar(self, im): im.save(os.path.join(self.CU, f'c{self.n:05d}.png')); self.n += 1
    def corte(self): self.cortes.append(self.n / FPS)
    def anotar(self, q): self.guion.append((f'{int(self.n / FPS // 60)}:{int(self.n / FPS % 60):02d}', q))
    def texto_centrado(self, d, y, partes, font):
        total = sum(d.textlength(t, font=font) for t, _ in partes); x = (W - total) / 2
        for t, c in partes: d.text((x, y), t, font=font, fill=c); x += d.textlength(t, font=font)
    def golpe(self, fondo, lineas, segundos, sub=None, sub_color=None):
        self.corte()
        for i in range(int(segundos * FPS)):
            base = Image.new('RGB', (W, H), fondo); capa = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dc = ImageDraw.Draw(capa)
            alto = sum(l[1].size + 20 for l in lineas); y = (H - alto) / 2 - 60
            for partes, font in lineas: self.texto_centrado(dc, y, partes, font); y += font.size + 20
            s = 1 + 0.25 * (1 - ease(i / 5))
            if s != 1:
                cw, ch = int(W * s), int(H * s); capa = capa.resize((cw, ch), Image.LANCZOS).crop(((cw - W) // 2, (ch - H) // 2, (cw - W) // 2 + W, (ch - H) // 2 + H))
            base.paste(capa, (0, 0), capa)
            if sub and i >= 8:
                a = ease((i - 8) / 6); d2 = ImageDraw.Draw(base); f = F(46, 'Medium'); d2.text(((W - d2.textlength(sub, font=f)) / 2, y + 40 + 20 * (1 - a)), sub, font=f, fill=sub_color)
            self.guardar(base)
    def pantalla(self, pg, segundos, titulo, accion=None, destacar=None, tick=None, fondo=PAPEL, tinta=TINTA):
        self.corte(); total = int(segundos * FPS)
        for i in range(total):
            if accion: accion(i, total)
            if tick: tick()
            cap = Image.open(io.BytesIO(pg.screenshot()))
            im = Image.new('RGB', (W, H), fondo); d = ImageDraw.Draw(im)
            TWd = 840; tel = cap.resize((TWd, int(TWd * cap.height / cap.width)), Image.LANCZOS)
            z = 1 + 0.04 * i / total; zz = tel.resize((int(tel.width * z), int(tel.height * z)), Image.LANCZOS); x0 = (zz.width - tel.width) // 2; tel = zz.crop((x0, 0, x0 + tel.width, tel.height))
            TX, TY = (W - tel.width) // 2, 470
            marco = Image.new('RGB', (tel.width + 28, H), TINTA if fondo != TINTA else '#2A2520'); m = Image.new('L', marco.size, 0)
            ImageDraw.Draw(m).rounded_rectangle([0, 0, marco.width - 1, marco.height + 200], 72, fill=255); im.paste(marco, (TX - 14, TY - 14), m)
            m2 = Image.new('L', tel.size, 0); ImageDraw.Draw(m2).rounded_rectangle([0, 0, tel.width - 1, tel.height + 200], 58, fill=255); im.paste(tel, (TX, TY), m2)
            a = ease(i / 6); f = F(74); lineas = titulo.split('\n'); y = 150 + (len(lineas) == 1) * 50 + 30 * (1 - a)
            for l in lineas:
                partes = []
                if destacar and destacar in l:
                    pre, post = l.split(destacar, 1); partes = [(x, c) for x, c in ((pre, tinta), (destacar, NBA if fondo != TINTA else TENIS), (post, tinta)) if x]
                else: partes = [(l, tinta)]
                self.texto_centrado(d, y, partes, f); y += 92
            if a < 1:
                velo = Image.new('RGB', (W, 450), fondo); im.paste(Image.blend(im.crop((0, 0, W, 450)), velo, 1 - a), (0, 0))
            self.guardar(im)
    def cierre(self, segundos=3.2, pie='App independiente · @manoamano.desafio'):
        self.corte(); self.anotar('Cierre: Mano a mano · gratis · ' + pie)
        for i in range(int(segundos * FPS)):
            im = Image.new('RGB', (W, H), TINTA); d = ImageDraw.Draw(im); a = ease(i / 8); cy = 560 + 40 * (1 - a)
            lo = ICO.resize((int(320 * (0.8 + 0.2 * a)),) * 2, Image.LANCZOS); im.paste(lo, (W // 2 - lo.width // 2, int(cy - lo.height // 2)), lo)
            self.texto_centrado(d, cy + 200, [('Mano a mano', '#fff')], F(120))
            self.texto_centrado(d, cy + 360, [('Desafiá a tus amigos.', GRIS)], F(46, 'Medium')); self.texto_centrado(d, cy + 416, [('Fútbol, tenis y NBA.', GRIS)], F(46, 'Medium'))
            b2 = ease((i - 10) / 8)
            if b2 > 0:
                pw, ph = 760, 150; py = int(cy + 540 + 30 * (1 - b2)); pulso = 1 + 0.03 * math.sin(max(0, i - 18) / FPS * 2 * math.pi * 2) if i > 18 else 1
                pw2, ph2 = int(pw * pulso), int(ph * pulso); px2, py2 = W // 2 - pw2 // 2, py + (ph - ph2) // 2
                d.rounded_rectangle([px2, py2, px2 + pw2, py2 + ph2], 40, fill=TENIS); self.texto_centrado(d, py2 + ph2 / 2 - 38, [('Jugá gratis. Link en la bio.', TINTA)], F(54))
            self.texto_centrado(d, H - 170, [(pie, GRIS)], F(36, 'Medium'))
            self.guardar(im)
    def armar(self):
        DUR = self.n / FPS; SR = 44100; N = int(DUR * SR); aud = np.zeros(N)
        def kick(at, amp=0.9):
            i0 = int(at * SR); L = int(0.35 * SR); tt = np.arange(L) / SR; f = 50 + 110 * np.exp(-tt * 30); s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9) * amp; aud[i0:i0 + L] += s[:max(0, min(L, N - i0))]
        def hat(at, amp=0.18):
            i0 = int(at * SR); L = int(0.05 * SR); s = np.random.randn(L) * np.exp(-np.arange(L) / SR * 90) * amp; s = np.diff(np.concatenate([[0], s])); aud[i0:i0 + L] += s[:max(0, min(L, N - i0))]
        def golpe_audio(at):
            i0 = int(at * SR); L = int(0.5 * SR); tt = np.arange(L) / SR; s = np.random.randn(L) * np.exp(-tt * 7) * 0.25 + np.sin(2 * np.pi * 42 * tt) * np.exp(-tt * 5) * 0.6; aud[i0:i0 + L] += s[:max(0, min(L, N - i0))]
        BEAT = 0.5; np.random.seed(1)
        for k in range(int(DUR / BEAT)):
            at = k * BEAT
            if at < 1.0: continue
            if at < DUR - 2.0: kick(at); hat(at + BEAT / 2); hat(at + BEAT / 4, 0.1)
        for c in self.cortes: golpe_audio(c)
        bajo = np.zeros(N)
        for k in range(int(DUR / BEAT)):
            at = k * BEAT
            if at < 2.0 or at >= DUR - 2.0: continue
            fr = 55 if (k // 8) % 2 == 0 else 61.7; i0 = int(at * SR); L = int(0.42 * SR); tt = np.arange(L) / SR; s = np.sign(np.sin(2 * np.pi * fr * tt)) * 0.12 * np.exp(-tt * 4); bajo[i0:i0 + L] += s[:max(0, min(L, N - i0))]
        aud += np.convolve(bajo, np.ones(40) / 40, mode='same'); aud = aud / (np.abs(aud).max() + 1e-9) * 0.85
        wav = os.path.join(AQUI, f'ritmo-{self.nombre}.wav')
        with wave.open(wav, 'w') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((aud * 32767).astype(np.int16).tobytes())
        for salida, extra in [(f'mam-{self.nombre}.mp4', ['-i', wav, '-c:a', 'aac', '-b:a', '160k', '-shortest']), (f'mam-{self.nombre}-sin-audio.mp4', [])]:
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(self.CU, 'c%05d.png')] + extra + ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(AQUI, salida)], check=True)
        with open(os.path.join(AQUI, f'guion-{self.nombre}.md'), 'w') as f: f.write('| tiempo | qué se ve |\n|---|---|\n' + ''.join(f'| {t} | {q} |\n' for t, q in self.guion))
        print(self.nombre, 'cuadros', self.n, 'segundos', round(DUR, 1))

# ── el servidor de la app y el Supabase de mentira ──
class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def servir():
    # nombres de verdad en la foto de prueba (la fixture de las pruebas dice "Liga de prueba")
    f = os.path.join(WWW, 'futbol', 'datos', 'liga-prueba.js'); manana = time.strftime('%Y-%m-%dT15:00:00.000Z', time.gmtime(time.time() + 86400))
    open(f, 'w').write('window.LIGAS=window.LIGAS||{};window.LIGAS["prueba"]=' + json.dumps({'id': 1, 'slug': 'prueba', 'nombre': 'Liga Profesional', 'equipos': {'10': {'n': 'Talleres'}, '11': {'n': 'Belgrano'}, '12': {'n': 'River'}, '13': {'n': 'Boca'}}, 'partidos': [
        {'id': 501, 'fecha': manana, 'ronda': 'Fecha 11', 'local': 10, 'visita': 11, 'estado': 'NS', 'golL': None, 'golV': None},
        {'id': 502, 'fecha': manana.replace('15:00', '19:00'), 'ronda': 'Fecha 11', 'local': 12, 'visita': 13, 'estado': 'NS', 'golL': None, 'golV': None}]}) + ';window.LIGAS_DISPONIBLES=["prueba"];\n')
    t = os.path.join(WWW, 'tenis', 'datos', 'tenis-hoy.js'); hoy = time.strftime('%Y-%m-%d')
    def pt(k, hora, torneo, ronda, a, b, pa, pb, sa, sb, p, dec): return {'k': k, 'qualy': False, 'fecha': hoy, 'hora': hora, 'torneo': torneo, 'ronda': ronda, 'sup': 'Hard', 'indoor': False, 'mejorDe': 3, 'a': a, 'b': b, 'pa': pa, 'pb': pb, 'saqueA': sa, 'saqueB': sb, 'pSaque': p, 'pElo': p, 'p': p, 'decisivo': dec}
    open(t, 'w').write('window.SV_HOY = ' + json.dumps({'generado': hoy + 'T12:00:00.000Z', 'modelo': 'real', 'partidos': [
        pt('t1', '15:00', 'Shanghai', '1/8-finals', {'k': 'a1', 'nombre': 'A. Rublev', 'rk': 10, 'pais': 'RUS'}, {'k': 'b1', 'nombre': 'N. Borges', 'rk': 48, 'pais': 'POR'}, 0.672, 0.61, 0.662, 0.605, 0.71, 0.34),
        pt('t2', '17:00', 'Shanghai', '1/8-finals', {'k': 'a2', 'nombre': 'J. Sinner', 'rk': 1, 'pais': 'ITA'}, {'k': 'b2', 'nombre': 'C. Alcaraz', 'rk': 2, 'pais': 'ESP'}, 0.701, 0.69, 0.70, 0.69, 0.52, 0.45),
        pt('t3', '19:00', 'Shanghai', '1/8-finals', {'k': 'a3', 'nombre': 'F. Cerúndolo', 'rk': 21, 'pais': 'ARG'}, {'k': 'b3', 'nombre': 'A. Zverev', 'rk': 3, 'pais': 'GER'}, 0.655, 0.68, 0.65, 0.68, 0.38, 0.41),
    ], 'jugados': [], 'jugadores': {}, 'cruces': {}}) + ';\n')
    h = functools.partial(Silencioso, directory=WWW); s = socketserver.TCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
UID = '11111111-1111-1111-1111-111111111111'
TOK = 'x.' + base64.urlsafe_b64encode(json.dumps({'sub': UID, 'exp': 9999999999, 'is_anonymous': True}).encode()).decode().rstrip('=') + '.y'
ESTADO = {'desafio': None}
def mock(pg, semilla):
    def r(route):
        u = route.request.url; ok = lambda d: route.fulfill(status=200, content_type='application/json', body=json.dumps(d), headers={'access-control-allow-origin': '*'})
        if route.request.method == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'})
        if 'supabase.co' not in u: return route.continue_() if '127.0.0.1' in u else route.abort()
        if '/auth/v1/user' in u: return ok({'id': UID, 'is_anonymous': True})
        if 'rest/v1/perfil' in u: return ok([{'id': UID, 'usuario': 'fausto', 'plan': 'gratis', 'premium_hasta': None}])
        if 'rest/v1/ajuste' in u and 'desafio_oficial' in u: return ok([{'clave': 'desafio_oficial', 'valor': 'NBA001'}] if ESTADO.get('oficial') else [])
        if 'rest/v1/ajuste' in u: return ok([{'clave': 'cobra', 'valor': 'no'}])
        if 'rpc/mis_desafios' in u: return ok([])
        if 'rpc/crear_desafio' in u:
            b = route.request.post_data_json
            ESTADO['desafio'] = {'codigo': 'K7M2PQ', 'nombre': b['p_nombre'], 'estado': 'abierto', 'creador': 'fausto', 'soy': True, 'modelo_puntos': 0, 'modelo_juega': 3,
                'partidos': [dict(p, resultado=None, empezo=False, modelo=None, modelo_p=None, mia=None, elecciones=None) for p in b['p_partidos']],
                'jugadores': [{'apodo': 'fausto', 'puntos': 0, 'creador': True, 'yo': True, 'elegidos': 0}]}
            return ok('K7M2PQ')
        if 'rpc/ver_desafio' in u: return ok(ESTADO.get('oficial') if ESTADO.get('oficial') and 'NBA001' in (route.request.post_data or '') else ESTADO['desafio'])
        if 'rpc/elegir_desafio' in u:
            b = route.request.post_data_json
            for p in (ESTADO.get('oficial') or ESTADO['desafio'])['partidos']:
                if p['deporte'] == b['p_deporte'] and p['partido'] == b['p_partido']: p['mia'] = b['p_eleccion']
            return ok(None)
        return ok([])
    pg.route('**/*', r)
    pg.add_init_script("try{localStorage.setItem('tste.sesion', JSON.stringify({token:%s, refresh:'r', uid:%s})); localStorage.setItem('mam.deportes','[\"futbol\",\"tenis\",\"nba\"]'); localStorage.setItem('mam.deporte','\"futbol\"'); localStorage.setItem('mam.pestana','\"partidos\"');}catch(e){}" % (json.dumps(TOK), json.dumps(UID)))
    pg.add_init_script("(() => { let s = %d; Math.random = () => { s = (s * 1103515245 + 12345) %% 2147483648; return s / 2147483648; }; })()" % semilla)
    pg.add_init_script("(() => { window.__vt = 0; const o = performance.now.bind(performance); performance.now = () => window.__vt; })()")
PASO = 1000 / FPS

def reel_desafios():
    R = Reel('desafios')
    R.golpe(TINTA, [([('¿Quién gana?', '#FFFFFF')], F(150))], 1.0); R.anotar('Golpe: ¿Quién gana?')
    R.golpe(FUTBOL, [([('Desafiá a', CREMA)], F(140)), ([('tus amigos.', CREMA)], F(140))], 1.2, sub='Fútbol, tenis y NBA.', sub_color=TENIS); R.anotar('Golpe: Desafiá a tus amigos.')
    srv = servir(); base = f'http://127.0.0.1:{srv.server_address[1]}'
    with sync_playwright() as p:
        b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='light'); pg = c.new_page(); mock(pg, 5)
        pg.goto(base + '/index.html'); pg.wait_for_timeout(3500)
        pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        tick = lambda: pg.evaluate(f'window.__vt += {PASO}')
        pg.click('#mam-barra [data-pestana="desafios"]'); pg.wait_for_timeout(400); pg.click('#mam-desafios [data-crear]'); pg.wait_for_timeout(400)
        pg.fill('#mam-desafios [data-nombre]', 'Finde con los pibes')
        ks = ['futbol:501', 'tenis:t2', 'nba:n1']
        def elegir(i, total):
            j = i // 16
            if i % 16 == 8 and j < len(ks): pg.click(f'#mam-desafios .mam-partido[data-k="{ks[j]}"]')
        R.pantalla(pg, 2.6, 'Elegí los partidos.\nDe los tres deportes.', elegir, 'tres deportes.', tick); R.anotar('La app: elegís partidos de fútbol, tenis y NBA')
        pg.click('#mam-desafios [data-crear-ya]'); pg.wait_for_timeout(800)
        R.pantalla(pg, 2.4, 'Mandá el código.\nTodos a ciegas.', None, 'a ciegas.', tick); R.anotar('El código del desafío y el link para mandar')
        def elegir2(i, total):
            if i == 10: pg.click('#mam-desafios [data-elegir="1"][data-partido="501"]')
            if i == 26: pg.click('#mam-desafios [data-elegir="2"][data-partido="t2"]')
            if i == 42: pg.click('#mam-desafios [data-elegir="1"][data-partido="n1"]')
        R.pantalla(pg, 2.2, 'Vos elegís.\nNadie ve nada.', elegir2, 'Nadie ve nada.', tick); R.anotar('Elegís quién gana; las elecciones quedan tapadas')
        d = ESTADO['desafio']; d['estado'] = 'en juego'
        d['jugadores'] = [{'apodo': 'fausto', 'puntos': 2, 'creador': True, 'yo': True, 'elegidos': 3}, {'apodo': 'nico_tdc', 'puntos': 2, 'creador': False, 'yo': False, 'elegidos': 3}, {'apodo': 'lucho', 'puntos': 1, 'creador': False, 'yo': False, 'elegidos': 3}]
        d['modelo_puntos'] = 1
        for k, p in enumerate(d['partidos']): p.update(empezo=True, modelo=[1, 1, 2][k], modelo_p=[0.48, 0.52, 0.56][k], resultado=[1, 2, None][k], elecciones={'fausto': p['mia'] or 1, 'nico_tdc': [1, 2, 2][k], 'lucho': [2, 2, 1][k]})
        pg.goto(base + '/index.html#desafio=K7M2PQ'); pg.wait_for_timeout(2500); pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        pg.evaluate("(document.querySelector('#mam-desafios .mam-tabla') || document.querySelector('#mam-desafios .mam-tarjeta')).scrollIntoView({block:'start'}); window.scrollBy(0, -70)"); pg.wait_for_timeout(100)
        R.pantalla(pg, 2.8, 'Cuando empieza,\nse revela todo.', None, 'se revela todo.', tick); R.anotar('La tabla: vos, tus amigos y el modelo')
        b.close()
    srv.shutdown()
    R.golpe(TINTA, [([('Y juega', CREMA)], F(150)), ([('el modelo.', TENIS)], F(150))], 1.5, sub='Un punto por partido. Se juega por el orgullo.', sub_color=GRIS); R.anotar('Golpe: y juega el modelo')
    R.cierre(); R.armar()

def reel_juegos():
    """Los juegos (21/10/2026): la mira al arrastrar, la cámara lenta en el gol, el aro grande. Se graba el gesto de verdad:
    primero se "arrastra" (mover) unos cuadros, para que se vea la mira, y después se suelta."""
    R = Reel('juegos')
    R.golpe(TINTA, [([('Arrastrá.', '#FFFFFF')], F(150)), ([('Apuntá.', '#FFFFFF')], F(150)), ([('Soltá.', TENIS)], F(150))], 1.3); R.anotar('Golpe: Arrastrá. Apuntá. Soltá.')
    srv = servir(); base = f'http://127.0.0.1:{srv.server_address[1]}'
    with sync_playwright() as p:
        b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='light'); pg = c.new_page(); mock(pg, int(sys.argv[2]) if len(sys.argv) > 2 else 7)
        pg.goto(base + '/index.html'); pg.wait_for_timeout(3000); pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        # el reloj virtual avanza en la página y en sus marcos (el tenis corre adentro del marco de Sacá vos)
        def tick():
            for f in pg.frames:
                try: f.evaluate(f'window.__vt += {PASO}')
                except Exception: pass
        S = lambda: pg.evaluate("(() => { const g = window.mamJuegos._estado(); const s = g.estado; return { fase: s.fase, tanda: s.tanda, t: s.t, msj: s.mensaje && s.mensaje.t, pista: s.pista, vuelo: !!(s.arquero && s.arquero.vuelo), vx: s.pelota && s.pelota.vx, vy: s.pelota && s.pelota.vy, puntos: s.puntos, serie: s.serie ? s.serie.length : 0 }; })()")
        soltar = lambda g: pg.evaluate("window.mamJuegos._soltar(%s)" % json.dumps(g))
        # arrastrar de a poco hacia (tx, ty) del arco: los cuadros `desde`..`hasta` muestran la mira; en `hasta` se suelta
        def arrastre_futbol(i, desde, hasta, tx, ty, vel, comba):
            if i < desde or i > hasta: return
            k = (i - desde) / max(1, hasta - desde)
            pg.evaluate("((k, tx, ty, vel, comba, suelta) => { const G = window.mamJuegos._estado(); const g = G.gestoHacia(tx, ty, vel, comba); const h = { toque: false, x: g.x, y: g.y, dx: g.dx * k, dy: g.dy * k, largo: g.largo * k, vel, comba: comba * k, angulo: g.angulo }; if (suelta) G.soltar(g); else G.mover(h); })(%s, %s, %s, %s, %s, %s)" % (k, tx, ty, vel, comba, 'true' if i == hasta else 'false'))
        pg.click('#mam-barra [data-pestana="juga"]'); pg.wait_for_timeout(500)
        pg.evaluate("document.querySelector('.mam-cancha').scrollIntoView({block:'start'}); window.scrollBy(0,-12)")
        soltar({'toque': True, 'x': 180, 'y': 300, 'largo': 0, 'dx': 0, 'dy': 0, 'vel': 0, 'comba': 0, 'angulo': 0})   # de la guía a listo
        def penales(i, total):
            s = S()
            if s['tanda'] == 'yo' and s['fase'] == 'listo': arrastre_futbol(i, 8, 30, -2.95, 2.0, 2.0, 0.05)
            if s['fase'] == 'vuelo-rival' and not s['vuelo'] and s['t'] > 0.1: vx = s['vx'] or 1; soltar({'toque': True, 'x': 180 - (1 if vx > 0 else -1) * (125 if abs(vx) > 2.5 else 70 if abs(vx) > 1 else 10), 'y': 200 if (s.get('vy') or 0) > 5 else 400, 'dx': 0, 'dy': 0, 'largo': 0})
        R.pantalla(pg, 4.2, 'Arrastrá la pelota\nhasta el ángulo.', penales, 'hasta el ángulo.', tick, fondo=TINTA, tinta='#fff'); R.anotar('Penales: la mira al arrastrar, el gol en cámara lenta'); print('penal:', S())
        R.pantalla(pg, 2.6, 'Patea él.\nTirate.', penales, 'Tirate.', tick, fondo=TINTA, tinta='#fff'); R.anotar('La atajada, desde atrás del arco')
        pg.click('#mam-juga [data-j="libre"]'); pg.wait_for_timeout(400); pg.evaluate("document.querySelector('.mam-cancha').scrollIntoView({block:'start'}); window.scrollBy(0,-12)")
        soltar({'toque': True, 'x': 180, 'y': 300, 'largo': 0, 'dx': 0, 'dy': 0, 'vel': 0, 'comba': 0, 'angulo': 0})
        def libre(i, total):
            s = S()
            if s['fase'] == 'listo':
                lado, gx = pg.evaluate("(() => { const S = window.mamJuegos._estado().estado; return [S.barrera.lado, S.gx]; })()")
                arrastre_futbol(i, 8, 34, gx - lado * 2.9, 1.95, 1.8, -lado * 0.5)
        R.pantalla(pg, 4.0, 'Curvá el dedo:\nla pelota dobla.', libre, 'la pelota dobla.', tick, fondo=TINTA, tinta='#fff'); R.anotar('Tiro libre: la mira muestra la comba alrededor de la barrera'); print('libre:', S())
        pg.evaluate("window.mam.ir('juga', 'nba')"); pg.wait_for_timeout(500); pg.evaluate("document.querySelector('.mam-cancha').scrollIntoView({block:'start'}); window.scrollBy(0,-12)")
        soltar({'toque': True, 'x': 180, 'y': 300, 'largo': 0, 'dx': 0, 'dy': 0, 'vel': 0, 'comba': 0, 'angulo': 0})
        def triples(i, total):
            s = S()
            if s['fase'] == 'listo' and 8 <= i <= 30:
                k = (i - 8) / 22; g = {'toque': False, 'largo': 190 * k, 'vel': 1.5, 'dy': -190 * k, 'dx': 0, 'comba': 0, 'angulo': 0.0, 'x': 180, 'y': 450}
                if i == 30: soltar(g)
                else: pg.evaluate("window.mamJuegos._estado().mover(%s)" % json.dumps(g))
            if s['fase'] == 'listo' and i > 30 and i % 40 == 0: soltar({'toque': False, 'largo': 190, 'vel': 1.5, 'dy': -190, 'dx': 0, 'comba': 0, 'angulo': 0.0, 'x': 180, 'y': 450})
        R.pantalla(pg, 4.0, 'Triples: el medidor\nte dice si va.', triples, 'te dice si va.', tick, fondo=TINTA, tinta='#fff'); R.anotar('Triples: el medidor de fuerza y el aro grande'); print('final:', S())
        # el tenis: la cancha nueva, vista como en la tele. Se juega adentro del marco de Sacá vos (svJuegos)
        pg.evaluate("window.mam.ir('juga', 'tenis')"); pg.wait_for_timeout(1500)
        fr = next((f for f in pg.frames if 'tenis' in f.url), None)
        if fr:
            bt = fr.query_selector('#sv-saque button')
            if bt: bt.click(); pg.wait_for_timeout(600)
            fr.evaluate("(() => { const cv = document.getElementById('sv-cancha'); if (cv) cv.scrollIntoView({ block: 'start' }); })()"); pg.wait_for_timeout(200)
            pg.evaluate("window.scrollTo(0, 0)")
            T = lambda: fr.evaluate("(() => { const G = window.svJuegos._estado(); const b = G.bola; return { fase: G.fase, k: b ? (performance.now() - b.t0) / b.dur : null }; })()")
            toc = lambda x, tipo=None: fr.evaluate("([x, t]) => window.svJuegos._tocar(x, t)", [x, tipo])
            def tenis(i, total):
                s = T()
                if s['fase'] == 'listo' and i == 10: toc(None)
                if s['fase'] == 'potencia' and i == 40: fr.evaluate("window.svJuegos._estado().potencia = 74"); toc(None)
                if s['fase'] == 'direccion' and i == 62: fr.evaluate("(() => { const G = window.svJuegos._estado(), C = window.svJuegos._C; G.cursor = C.medio - 96; })()"); toc(None)
                if s['fase'] == 'viene-saque' and s['k'] is not None and s['k'] > 0.92: toc(150)
                if s['fase'] == 'viene' and s['k'] is not None and s['k'] > 0.92: toc(250)
            R.pantalla(pg, 4.6, 'Tenis: el punto entero,\ncomo en la tele.', tenis, 'como en la tele.', tick, fondo=TINTA, tinta='#fff'); R.anotar('Tenis: la cancha en perspectiva, el saque y el peloteo'); print('tenis:', T())
        b.close()
    srv.shutdown()
    R.golpe(TINTA, [([('Los juegos,', CREMA)], F(130)), ([('de nuevo.', TENIS)], F(130))], 1.2, sub='Más cerca. Más claro. Gratis.', sub_color=GRIS); R.anotar('Golpe: los juegos, de nuevo')
    R.cierre(pie='App independiente · armael11.com/app'); R.armar()


# ── la pantalla del club adentro del cascarón: el once, el planteo y el partido que se ve ──
LIMPIAR = """(() => { const v = document.querySelector('#vista'); if (!v) return;
  [...v.querySelectorAll('.aviso, .nota, p, div')].forEach((e) => { const t = (e.innerText || '').trim(); if (e.children.length < 3 && /^(Datos del|Formaciones tentativas|Te quedan|Esto es del plan)/.test(t)) e.remove(); });
  v.querySelectorAll('.mam-candado').forEach((e) => e.remove()); v.querySelectorAll('#bsim span').forEach((e) => e.remove());
  [...v.querySelectorAll('button')].filter((b) => /Ver los planes/.test(b.textContent)).forEach((b) => b.remove()); })()"""
def abrir_club(pg, base):
    """el cascarón con el frame de fútbol apuntando a la página del club, ya en 'armar' (el once en la cancha)"""
    pg.goto(base + '/index.html'); pg.wait_for_timeout(3000)
    pg.evaluate("document.getElementById('mam-futbol').src = 'futbol/talleres-cba.html?mam=1'"); pg.wait_for_timeout(3500)
    f = [x for x in pg.frames if 'talleres' in x.url][0]
    f.evaluate("PREMIUM.activo = true; AVISO.DURACION_PAGA = 5000")
    f.click('#vista button.acc'); pg.wait_for_timeout(2500)
    pg.add_style_tag(content='*{transition:none !important;animation:none !important}'); f.add_style_tag(content='*{transition:none !important;animation:none !important;scroll-behavior:auto !important}')
    f.evaluate(LIMPIAR); f.evaluate("document.querySelector('#campo').scrollIntoView({block:'start'}); window.scrollBy(0,-64)")
    return f

def reel_simulaciones():
    R = Reel('simulaciones')
    R.golpe(FUTBOL, [([('Armá', CREMA)], F(150)), ([('tu once.', CREMA)], F(150))], 1.2, sub='Y mirá cómo sale.', sub_color=TENIS); R.anotar('Golpe: Armá tu once.')
    srv = servir(); base = f'http://127.0.0.1:{srv.server_address[1]}'
    with sync_playwright() as p:
        b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='light'); pg = c.new_page(); mock(pg, 5); pg.clock.install()
        f = abrir_club(pg, base)
        limpiar = lambda: f.evaluate(LIMPIAR)
        def cambiar(i, total):
            if i == 12: f.click('#campo .jug[data-lado="A"][data-slot="9"]')
            if i == 44: f.click('.picker .opt:not(.enCancha)')
        R.pantalla(pg, 2.8, 'Tocás un jugador.\nLo cambiás.', cambiar, 'Lo cambiás.', limpiar); R.anotar('La cancha: tocás un jugador, elegís otro del plantel')
        f.evaluate("[...document.querySelectorAll('#vista h3, #vista .sec, #vista h4')].find((h) => /TU PLANTEO/i.test(h.textContent)).scrollIntoView({block:'start'}); window.scrollBy(0, -70)")
        def planteo(i, total):
            if i == 14: f.evaluate("[...document.querySelectorAll('#vista button')].find((b) => b.textContent.trim() === 'Se juega la vida').click()")
        R.pantalla(pg, 2.2, 'Elegís\nel planteo.', planteo, 'el planteo.', limpiar); R.anotar('El planteo: se juega la vida')
        # el partido: los goles van fijos para que el reel tenga gol temprano; la pelota la mueve la app
        f.evaluate("(() => { const g = generarPartido; generarPartido = (a, b, d) => { const p = g(a, b, d); p.eventos = [{ m: 9, lado: 'A' }, { m: 38, lado: 'B' }, { m: 71, lado: 'A' }]; p.marc = { A: 2, B: 1 }; return p; }; })()")
        # el tanteador vive debajo de la cancha: se acomoda el scroll para que entre en el teléfono (el arco de arriba queda bajo la barra)
        f.evaluate("document.querySelector('[data-ver=\"1\"]').click()"); pg.wait_for_timeout(300); limpiar()
        f.evaluate("(() => { const c = document.querySelector('#campo'); c.scrollIntoView = () => {}; const e = c.nextElementSibling || c; window.scrollBy(0, e.getBoundingClientRect().bottom - 560); })()"); limpiar()
        pg.clock.pause_at(int(time.time() * 1000) + 50)
        f.evaluate("document.querySelector('#bsim').click()")
        tick = lambda: (pg.clock.run_for(int(PASO)), f.evaluate(LIMPIAR))
        R.pantalla(pg, 5.6, 'Y lo ves\njugarse.', None, 'jugarse.', tick); R.anotar('El partido se juega en la cancha: reloj, pelota, ¡GOL!')
        pg.clock.run_for(1500); limpiar()
        f.evaluate("(document.querySelector('.res') || document.querySelector('#campo')).scrollIntoView({block:'start'}); window.scrollBy(0,-96)"); limpiar()
        R.pantalla(pg, 2.6, 'El resultado\ncambia con vos.', None, 'cambia con vos.', limpiar); R.anotar('El resultado de tu simulación')
        b.close()
    srv.shutdown()
    R.golpe(TINTA, [([('Once ligas.', CREMA)], F(140)), ([('Cualquier partido.', TENIS)], F(92))], 1.5, sub='Y el de tu club, siempre.', sub_color=GRIS); R.anotar('Golpe: once ligas, cualquier partido')
    R.cierre(); R.armar()

def reel_tres():
    R = Reel('tres')
    R.golpe(TINTA, [([('Una app.', CREMA)], F(150)), ([('Tres deportes.', TENIS)], F(130))], 1.3); R.anotar('Golpe: una app, tres deportes')
    srv = servir(); base = f'http://127.0.0.1:{srv.server_address[1]}'
    with sync_playwright() as p:
        b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='light'); pg = c.new_page(); mock(pg, 5)
        f = abrir_club(pg, base)
        R.pantalla(pg, 1.9, 'Fútbol.', None, None, lambda: f.evaluate(LIMPIAR), fondo=FUTBOL, tinta=CREMA); R.anotar('Fútbol: la cancha con tu once')
        # el resto va en una pestaña nueva: el cascarón arma la lista de partidos del desafío al cargar el frame de fútbol de la liga
        pg = c.new_page(); mock(pg, 5); pg.goto(base + '/index.html'); pg.wait_for_timeout(3500); pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        pg.evaluate("window.mam.ir('partidos', 'tenis')"); pg.wait_for_timeout(1500)
        ft = [x for x in pg.frames if 'tenis/' in x.url][0]; ft.add_style_tag(content='*{transition:none !important;animation:none !important}')
        R.pantalla(pg, 1.9, 'Tenis.', None, None, None, fondo='#C2542E', tinta=CREMA); R.anotar('Tenis: el partido que viene, con su número')
        pg.evaluate("window.mam.ir('partidos', 'nba')"); pg.wait_for_timeout(1500)
        fn = [x for x in pg.frames if 'nba/' in x.url][0]; fn.add_style_tag(content='*{transition:none !important;animation:none !important}')
        R.pantalla(pg, 1.9, 'NBA.', None, None, None, fondo=NBA, tinta=CREMA); R.anotar('NBA: el partido de la noche')
        pg.evaluate("window.mam.ir('juga', 'nba')"); pg.wait_for_timeout(900); pg.evaluate("document.querySelector('.mam-cancha').scrollIntoView({block:'start'}); window.scrollBy(0,-12)")
        tick = lambda: pg.evaluate(f'window.__vt += {PASO}')
        def triples(i, total):
            s = pg.evaluate("(() => { const s = window.mamJuegos._estado().estado; return { fase: s.fase }; })()")
            if s['fase'] in ('guia', 'listo') and i > 6: pg.evaluate("window.mamJuegos._soltar(%s)" % json.dumps({'toque': False, 'largo': 190, 'vel': 1.5, 'dy': -100, 'dx': 0, 'comba': 0, 'angulo': 0.0, 'x': 180, 'y': 450}))
        R.pantalla(pg, 2.2, 'Juegos.', triples, None, tick, fondo=TINTA, tinta=CREMA); R.anotar('Juegos: triples')
        pg.click('#mam-barra [data-pestana="desafios"]'); pg.wait_for_timeout(400); pg.click('#mam-desafios [data-crear]'); pg.wait_for_timeout(400)
        pg.fill('#mam-desafios [data-nombre]', 'Finde con los pibes')
        for k in ['futbol:501', 'tenis:t2', 'nba:n1']: pg.click(f'#mam-desafios .mam-partido[data-k="{k}"]')
        R.pantalla(pg, 2.2, 'Y tus amigos.', None, 'tus amigos.', None); R.anotar('Desafíos: un desafío con los tres deportes')
        b.close()
    srv.shutdown()
    R.golpe(TENIS, [([('Todo en una.', TINTA)], F(150))], 1.2, sub='Gratis, sin cuenta.', sub_color=TINTA); R.anotar('Golpe: todo en una')
    R.cierre(); R.armar()

def reel_modelo():
    R = Reel('modelo')
    R.golpe(TINTA, [([('¿Le ganás', CREMA)], F(150)), ([('al modelo?', TENIS)], F(150))], 1.3); R.anotar('Golpe: ¿le ganás al modelo?')
    srv = servir(); base = f'http://127.0.0.1:{srv.server_address[1]}'
    with sync_playwright() as p:
        b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='light'); pg = c.new_page(); mock(pg, 5)
        ahora = time.time() * 1000
        def part(dep, k, local, visita, rotulo, opciones, res, modelo, p, elecciones, hace):
            return {'deporte': dep, 'partido': k, 'empieza': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime((ahora - hace) / 1000)), 'local': local, 'visita': visita, 'rotulo': rotulo, 'opciones': opciones, 'resultado': res, 'empezo': True, 'modelo': modelo, 'modelo_p': p, 'mia': elecciones['fausto'], 'elecciones': elecciones}
        ESTADO['desafio'] = {'codigo': 'K7M2PQ', 'nombre': 'Finde con los pibes', 'estado': 'terminado', 'creador': 'fausto', 'soy': True, 'modelo_puntos': 2, 'modelo_juega': 5, 'puesto': 2,
            'partidos': [part('futbol', '501', 'Talleres', 'Belgrano', 'Liga Profesional · Fecha 11', 3, 1, 1, 0.46, {'fausto': 1, 'nico': 1, 'lucho': 3}, 2.6e8),
                         part('futbol', '502', 'River', 'Boca', 'Liga Profesional · Fecha 11', 3, 2, 1, 0.44, {'fausto': 1, 'nico': 2, 'lucho': 1}, 2.5e8),
                         part('tenis', 't2', 'J. Sinner', 'C. Alcaraz', 'Shanghai · final', 2, 2, 1, 0.52, {'fausto': 2, 'nico': 2, 'lucho': 1}, 1.8e8),
                         part('nba', 'n1', 'Boston', 'Denver', 'NBA', 2, 1, 2, 0.56, {'fausto': 1, 'nico': 1, 'lucho': 2}, 1.2e8),
                         part('futbol', '503', 'Racing', 'Independiente', 'Liga Profesional · Fecha 11', 3, 3, 1, 0.41, {'fausto': 3, 'nico': 3, 'lucho': 3}, 0.9e8)],
            'jugadores': [{'apodo': 'fausto', 'puntos': 3, 'creador': True, 'yo': True, 'elegidos': 5}, {'apodo': 'nico', 'puntos': 4, 'creador': False, 'yo': False, 'elegidos': 5}, {'apodo': 'lucho', 'puntos': 2, 'creador': False, 'yo': False, 'elegidos': 5}]}
        pg.goto(base + '/index.html#desafio=K7M2PQ'); pg.wait_for_timeout(3000); pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        pg.evaluate("document.querySelector('#mam-desafios .mam-tabla').scrollIntoView({block:'start'}); window.scrollBy(0, 60)")
        R.pantalla(pg, 3.0, 'Esta semana\nle ganó Nico.', None, 'le ganó Nico.', None); R.anotar('La tabla: Nico 4, vos 3, el modelo 2')
        pg.evaluate("window.scrollTo(0, 0); document.querySelector('#mam-desafios .mam-dia').scrollIntoView({block:'start'}); window.scrollBy(0, -70)")
        R.pantalla(pg, 2.6, 'Partido a partido,\na la vista.', None, 'a la vista.', None); R.anotar('Cada partido: lo que eligió cada uno y lo que pasó')
        b.close()
    srv.shutdown()
    R.golpe(FUTBOL, [([('El modelo juega.', CREMA)], F(104)), ([('Y también pierde.', CREMA)], F(104))], 1.6, sub='Un jugador más en tu desafío.', sub_color=TENIS); R.anotar('Golpe: el modelo juega y también pierde')
    R.golpe(TINTA, [([('Armá el tuyo.', CREMA)], F(124))], 1.1, sub='Mandá el código al grupo.', sub_color=GRIS); R.anotar('Golpe: armá el tuyo')
    R.cierre(); R.armar()

def reel_presentacion():
    """para la cuenta @armael11 que pasa a llamarse Mano a mano: 'ahora somos mucho más que fútbol'"""
    R = Reel('presentacion')
    # 1. Armá el 11 → Mano a mano: el nombre viejo sobre verde, y la marca nueva que entra sobre tinta
    R.golpe(FUTBOL, [([('Armá el 11', CREMA)], F(150))], 1.4, sub='ahora se llama', sub_color=TENIS); R.anotar('Golpe: Armá el 11 ahora se llama…')
    R.corte(); R.anotar('La marca nueva: Mano a mano')
    for i in range(int(2.0 * FPS)):
        im = Image.new('RGB', (W, H), TINTA); d = ImageDraw.Draw(im); a = ease(i / 10); cy = 760 + 40 * (1 - a)
        lo = ICO.resize((int(360 * (0.7 + 0.3 * a)),) * 2, Image.LANCZOS); im.paste(lo, (W // 2 - lo.width // 2, int(cy - lo.height // 2)), lo)
        b = ease((i - 8) / 10)
        if b > 0: R.texto_centrado(d, cy + 230 + 30 * (1 - b), [('Mano a mano', '#fff')], F(124))
        c = ease((i - 20) / 10)
        if c > 0: R.texto_centrado(d, cy + 400, [('Mucho más que fútbol.', TENIS)], F(56))
        R.guardar(im)
    srv = servir(); base = f'http://127.0.0.1:{srv.server_address[1]}'
    with sync_playwright() as p:
        b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='light'); pg = c.new_page(); mock(pg, 5)
        f = abrir_club(pg, base)
        R.pantalla(pg, 2.2, 'El fútbol,\nigual que siempre.', None, 'igual que siempre.', lambda: f.evaluate(LIMPIAR), fondo=FUTBOL, tinta=CREMA); R.anotar('Fútbol: la cancha con tu once, como siempre')
        pg = c.new_page(); mock(pg, 5); pg.goto(base + '/index.html'); pg.wait_for_timeout(3500); pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        pg.evaluate("window.mam.ir('partidos', 'tenis')"); pg.wait_for_timeout(1500)
        ft = [x for x in pg.frames if 'tenis/' in x.url][0]; ft.add_style_tag(content='*{transition:none !important;animation:none !important}')
        R.pantalla(pg, 2.0, 'Y ahora,\ntenis.', None, 'tenis.', None, fondo='#C2542E', tinta=CREMA); R.anotar('Tenis: el partido que viene')
        pg.evaluate("window.mam.ir('partidos', 'nba')"); pg.wait_for_timeout(1500)
        fn = [x for x in pg.frames if 'nba/' in x.url][0]; fn.add_style_tag(content='*{transition:none !important;animation:none !important}')
        R.pantalla(pg, 2.0, 'Y NBA.', None, None, None, fondo=NBA, tinta=CREMA); R.anotar('NBA: el partido de la noche')
        pg.click('#mam-barra [data-pestana="desafios"]'); pg.wait_for_timeout(400); pg.click('#mam-desafios [data-crear]'); pg.wait_for_timeout(400)
        pg.fill('#mam-desafios [data-nombre]', 'Finde con los pibes')
        for k in ['futbol:501', 'tenis:t2', 'nba:n1']: pg.click(f'#mam-desafios .mam-partido[data-k="{k}"]')
        R.pantalla(pg, 2.2, 'Y desafíos\ncon tus amigos.', None, 'con tus amigos.', None); R.anotar('Desafíos: un desafío con los tres deportes')
        tick = lambda: pg.evaluate(f'window.__vt += {PASO}')
        S = lambda: pg.evaluate("(() => { const s = window.mamJuegos._estado().estado; return { fase: s.fase, tanda: s.tanda, t: s.t, vuelo: !!(s.arquero && s.arquero.vuelo), vx: s.pelota && s.pelota.vx, vy: s.pelota && s.pelota.vy }; })()")
        soltar = lambda g: pg.evaluate("window.mamJuegos._soltar(%s)" % json.dumps(g))
        pg.evaluate("window.mam.ir('juga', 'futbol')"); pg.wait_for_timeout(700); pg.evaluate("document.querySelector('.mam-cancha').scrollIntoView({block:'start'}); window.scrollBy(0,-12)")
        def penales(i, total):
            s = S()
            if s['fase'] in ('guia', 'listo') and s['tanda'] == 'yo' and i > 6: soltar({'toque': False, 'largo': 112, 'vel': 1.9, 'dy': -100, 'dx': -40, 'comba': 0.1, 'angulo': 0.42, 'x': 180, 'y': 430})
        R.pantalla(pg, 2.6, 'Y juegos.', penales, None, tick, fondo=TINTA, tinta=CREMA); R.anotar('Juegos: penales contra el modelo')
        b.close()
    srv.shutdown()
    R.golpe(TENIS, [([('Misma cuenta.', TINTA)], F(130)), ([('Más juego.', TINTA)], F(130))], 1.5, sub='Fútbol, tenis y NBA. Gratis.', sub_color=TINTA); R.anotar('Golpe: misma cuenta, más juego')
    R.cierre(); R.armar()

def reel_nba():
    """Arranca la NBA (20/10/2026): el desafío oficial de la semana, adentro de la app."""
    R = Reel('nba')
    R.golpe(TINTA, [([('Arranca', CREMA)], F(160)), ([('la NBA.', NBA)], F(160))], 1.3, sub='Martes 20 de octubre.', sub_color=GRIS); R.anotar('Golpe: Arranca la NBA')
    R.golpe(NBA, [([('¿Quién gana', TINTA)], F(130)), ([('cada partido?', TINTA)], F(130))], 1.1); R.anotar('Golpe: ¿Quién gana cada partido?')
    juegos = [('n1', 'Pistons', 'Celtics', '2026-10-20T19:00:00.000Z'), ('n2', 'Knicks', '76ers', '2026-10-20T23:00:00.000Z'), ('n3', 'Spurs', 'Thunder', '2026-10-21T01:30:00.000Z'),
              ('n4', 'Heat', 'Timberwolves', '2026-10-21T23:30:00.000Z'), ('n5', 'Rockets', 'Mavericks', '2026-10-22T00:30:00.000Z'), ('n6', 'Lakers', 'Warriors', '2026-10-22T02:00:00.000Z')]
    ESTADO['oficial'] = {'codigo': 'NBA001', 'nombre': 'Arranca la NBA', 'estado': 'abierto', 'creador': 'manoamano', 'oficial': True, 'total': 0, 'soy': True, 'modelo_puntos': 0, 'modelo_juega': 0,
        'partidos': [{'deporte': 'nba', 'partido': k, 'empieza': e, 'local': l, 'visita': v, 'rotulo': 'NBA', 'opciones': 2, 'resultado': None, 'empezo': False, 'modelo': None, 'modelo_p': None, 'mia': None, 'elecciones': None} for k, l, v, e in juegos],
        'jugadores': [{'apodo': 'fausto', 'puntos': 0, 'creador': False, 'yo': True, 'elegidos': 0}]}
    srv = servir(); base = f'http://127.0.0.1:{srv.server_address[1]}'
    with sync_playwright() as p:
        b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='light'); pg = c.new_page(); mock(pg, 5)
        pg.goto(base + '/index.html'); pg.wait_for_timeout(3000); pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        tick = lambda: pg.evaluate(f'window.__vt += {PASO}')
        pg.click('#mam-barra [data-pestana="desafios"]'); pg.wait_for_selector('#mam-desafios .mam-oficial', timeout=10000); pg.wait_for_timeout(2500)
        R.pantalla(pg, 2.6, 'El desafío de la semana\nabre la temporada.', None, 'abre la temporada.', tick); R.anotar('Desafíos: arriba, el desafío de la semana: Arranca la NBA')
        pg.click('#mam-desafios [data-oficial-jugar]'); pg.wait_for_timeout(1500)
        pg.evaluate("(document.querySelector('#mam-desafios .mam-dia') || document.body).scrollIntoView({block:'start'}); window.scrollBy(0, -70)"); pg.wait_for_timeout(200)
        def elegir(i, total):
            for k, (cuadro, eleccion) in enumerate([(10, '2'), (24, '1'), (38, '2'), (52, '1')]):
                if i == cuadro: pg.click(f'#mam-desafios [data-elegir="{eleccion}"][data-partido="n{k + 1}"]')
        R.pantalla(pg, 2.8, 'Seis partidos.\nVos elegís.', elegir, 'Vos elegís.', tick); R.anotar('Elegís quién gana en los seis partidos del arranque')
        # empezó: se revelan las elecciones de todos y la del modelo
        d = ESTADO['oficial']; d['estado'] = 'en juego'; d['modelo_juega'] = 6; d['modelo_puntos'] = 1
        res = [2, 1, None, None, None, None]; mod = [2, 2, 1, 1, 2, 1]; mp = [0.57, 0.53, 0.61, 0.55, 0.52, 0.58]
        for k, pa in enumerate(d['partidos']):
            if k < 3: pa.update(empezo=True, modelo=mod[k], modelo_p=mp[k], resultado=res[k], elecciones={'fausto': pa['mia'] or 1, 'nico': [2, 2, 1][k], 'lucho': [1, 1, 1][k], 'caro': [2, 1, 2][k]})
        d['jugadores'] = [{'apodo': 'fausto', 'puntos': 2, 'creador': False, 'yo': True, 'elegidos': 6}, {'apodo': 'caro', 'puntos': 2, 'creador': False, 'yo': False, 'elegidos': 6},
                          {'apodo': 'nico', 'puntos': 1, 'creador': False, 'yo': False, 'elegidos': 6}, {'apodo': 'lucho', 'puntos': 1, 'creador': False, 'yo': False, 'elegidos': 6}]
        d['total'] = 4
        pg.goto(base + '/index.html#desafio=NBA001'); pg.wait_for_timeout(2500); pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        pg.evaluate("(document.querySelector('#mam-desafios .mam-dia') || document.body).scrollIntoView({block:'start'}); window.scrollBy(0, -70)"); pg.wait_for_timeout(100)
        R.pantalla(pg, 2.6, 'Cuando empieza,\nse revela todo.', None, 'se revela todo.', tick); R.anotar('Empezó: se ven las elecciones de todos y la del modelo')
        pg.add_style_tag(content='#mam-desafios{padding-bottom:520px !important}')
        pg.evaluate("(() => { const t = document.querySelector('#mam-desafios .mam-tabla'); const c = t.closest('.mam-pantalla') || document.scrollingElement; c.scrollTop += t.getBoundingClientRect().top - 150; })()"); pg.wait_for_timeout(100)
        R.pantalla(pg, 2.4, 'Tus amigos.\nY el modelo.', None, 'Y el modelo.', tick); R.anotar('La tabla: vos, tus amigos y el modelo')
        b.close()
    srv.shutdown(); ESTADO['oficial'] = None
    R.golpe(TINTA, [([('Gratis.', CREMA)], F(150)), ([('Con un apodo.', TENIS)], F(110))], 1.4, sub='Se juega por el orgullo.', sub_color=GRIS); R.anotar('Golpe: gratis, con un apodo')
    R.cierre(pie='App independiente · armael11.com/app'); R.armar()

def reel_explica():
    """Cómo funciona el desafío (19/10/2026): para fijar en el perfil. Sin fechas ni códigos. Chicana a los amigos y el modelo
    como el rival que hay que vencer: la tabla termina con el modelo arriba (nunca mostrar a alguien ganándole)."""
    R = Reel('explica')
    R.golpe(TINTA, [([('Tu amigo dice', CREMA)], F(120)), ([('que sabe', CREMA)], F(120)), ([('de fútbol.', CREMA)], F(120))], 1.5); R.anotar('Golpe: Tu amigo dice que sabe de fútbol.')
    R.golpe(TENIS, [([('Que lo', TINTA)], F(170)), ([('demuestre.', TINTA)], F(170))], 1.1); R.anotar('Golpe: Que lo demuestre.')
    srv = servir(); base = f'http://127.0.0.1:{srv.server_address[1]}'
    with sync_playwright() as p:
        b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='light'); pg = c.new_page(); mock(pg, 5)
        pg.goto(base + '/index.html'); pg.wait_for_timeout(3500)
        pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        tick = lambda: pg.evaluate(f'window.__vt += {PASO}')
        pg.click('#mam-barra [data-pestana="desafios"]'); pg.wait_for_timeout(400); pg.click('#mam-desafios [data-crear]'); pg.wait_for_timeout(400)
        pg.fill('#mam-desafios [data-nombre]', 'A ver quién sabe')
        ks = ['futbol:501', 'tenis:t2', 'nba:n1']
        def elegir(i, total):
            j = i // 16
            if i % 16 == 8 and j < len(ks): pg.click(f'#mam-desafios .mam-partido[data-k="{ks[j]}"]')
        R.pantalla(pg, 2.6, 'Armá un desafío.\nFútbol, tenis y NBA.', elegir, 'Fútbol, tenis y NBA.', tick); R.anotar('Armás el desafío: partidos de fútbol, tenis y NBA')
        pg.click('#mam-desafios [data-crear-ya]'); pg.wait_for_timeout(800)
        R.pantalla(pg, 2.3, 'Mandale el link.\nSin excusas.', None, 'Sin excusas.', tick); R.anotar('El código y el link para mandar al grupo')
        def elegir2(i, total):
            if i == 10: pg.click('#mam-desafios [data-elegir="1"][data-partido="501"]')
            if i == 26: pg.click('#mam-desafios [data-elegir="2"][data-partido="t2"]')
            if i == 42: pg.click('#mam-desafios [data-elegir="1"][data-partido="n1"]')
        R.pantalla(pg, 2.3, 'Cada uno elige.\nA ciegas.', elegir2, 'A ciegas.', tick); R.anotar('Cada uno elige quién gana; nadie ve lo del otro')
    # (el navegador se cierra abajo, después del golpe del modelo)
        R.golpe(TINTA, [([('Y hay', CREMA)], F(150)), ([('un rival más:', CREMA)], F(150)), ([('el modelo.', TENIS)], F(150))], 1.6, sub='Elige antes que vos. Y no se esconde.', sub_color=GRIS); R.anotar('Golpe: y hay un rival más: el modelo')
        d = ESTADO['desafio']; d['estado'] = 'terminado'; d['modelo_juega'] = 3; d['modelo_puntos'] = 3
        d['jugadores'] = [{'apodo': 'fausto', 'puntos': 2, 'creador': True, 'yo': True, 'elegidos': 3}, {'apodo': 'nico_tdc', 'puntos': 1, 'creador': False, 'yo': False, 'elegidos': 3}, {'apodo': 'lucho', 'puntos': 1, 'creador': False, 'yo': False, 'elegidos': 3}]
        res = [1, 2, 1]; mp = [0.74, 0.71, 0.68]
        for k, pa in enumerate(d['partidos']): pa.update(empezo=True, resultado=res[k], modelo=res[k], modelo_p=mp[k], elecciones={'fausto': pa['mia'] or 1, 'nico_tdc': [2, 2, 2][k], 'lucho': [1, 1, 2][k]})
        pg.goto(base + '/index.html#desafio=K7M2PQ'); pg.wait_for_timeout(2500); pg.add_style_tag(content='*{transition:none !important;animation:none !important}')
        pg.evaluate("(document.querySelector('#mam-desafios .mam-dia') || document.body).scrollIntoView({block:'start'}); window.scrollBy(0, -70)"); pg.wait_for_timeout(100)
        R.pantalla(pg, 2.6, 'Cuando arranca,\nse revela todo.', None, 'se revela todo.', tick); R.anotar('Empezó: se ven las elecciones de todos y la del modelo, con su número')
        pg.evaluate("window.scrollTo(0,0); const t = document.querySelector('#mam-desafios .mam-tarjeta'); if (t) t.scrollIntoView({block:'start'}); window.scrollBy(0, -70)"); pg.wait_for_timeout(100)
        R.pantalla(pg, 2.6, 'Al final,\nla tabla no miente.', None, 'la tabla no miente.', tick); R.anotar('Terminó: arriba de todo, quién ganó (el modelo) y el botón para compartir')
        b.close()
    srv.shutdown(); ESTADO['desafio'] = None
    R.golpe(TENIS, [([('¿Podés con', TINTA)], F(150)), ([('el modelo?', TINTA)], F(150))], 1.4, sub='Sus números, partido por partido, en la app.', sub_color=TINTA); R.anotar('Golpe: ¿Podés con el modelo?')
    R.golpe(TINTA, [([('Gratis.', CREMA)], F(150)), ([('Con un apodo.', TENIS)], F(110))], 1.3, sub='Se juega por el orgullo.', sub_color=GRIS); R.anotar('Golpe: gratis, con un apodo')
    R.cierre(segundos=3.4, pie='App independiente · armael11.com/app'); R.armar()

if __name__ == '__main__':
    que = sys.argv[1] if len(sys.argv) > 1 else 'todos'
    if que in ('desafios', 'todos'): reel_desafios()
    if que in ('simulaciones', 'todos'): reel_simulaciones()
    if que in ('juegos', 'todos'): reel_juegos()
    if que in ('tres', 'todos'): reel_tres()
    if que in ('modelo', 'todos'): reel_modelo()
    if que in ('presentacion', 'todos'): reel_presentacion()
    if que == 'nba': reel_nba()
    if que == 'explica': reel_explica()
