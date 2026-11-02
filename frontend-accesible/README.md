# EnseñaVos: versión accesible

Prototipo del frontend pensado para personas sordas: **primero la seña, luego
el ícono y al final una palabra**. Sin párrafos; los avisos son visuales.

Es una copia de `frontend/` con las pantallas principales rediseñadas. Usa el
mismo backend, así que el reconocimiento funciona igual que en la versión
original.

## Cómo verla

Desde la raíz del proyecto:

```bash
docker compose up --build
```

- Versión accesible: http://localhost:5174
- Versión original: http://localhost:5173

Las dos usan el mismo backend y la misma base de datos.

## Qué cambia

| Pantalla | Versión accesible |
|---|---|
| Entrada | Se elige un **animal** y se marca un **PIN de 4 números**. No hay que escribir usuario ni contraseña. La sesión queda abierta. El ícono de teclado lleva a la entrada clásica |
| Menú | 3 botones grandes, cada uno con su color, su ícono y el **video de su seña**: Traducir (azul), Practicar (verde) e Historial (morado). Datos y Grabar señas pasan a un submenú |
| Traductor | **Grabar primero, traducir después.** Se toca ⏺ y se hacen todas las señas de corrido, sin pausas. Se termina con ■ o simplemente **bajando las manos 2 s**. Mientras graba, el borde late en rojo y se ve el tiempo. Después, la app analiza la grabación completa y muestra **solo las señas reconocidas, una ficha por seña y en el orden en que salieron**, sin interpretarlas ni armar frases. 🔊 las lee en voz alta para la persona oyente, ⌫ borra la última y 🎤 escucha la respuesta. El borde también avisa si se ve la mano: verde con mano, gris sin mano. **La cara también cuenta:** las palabras dichas con una misma expresión van juntas en un recuadro de color con su emoji arriba (🤨 pregunta, 🧐 pregunta abierta, 🙅 negación, 🙆 afirmación, 😤 intensidad); una expresión sin seña aparece sola. La carita sobre la cámara se pone verde cuando se ve la cara; tocándola se apaga o enciende la lectura de cara |
| Práctica | Se elige la seña por su dibujo. **3 estrellas** se llenan mientras se sostiene bien y aparece un ✓ grande al lograrla |
| Historial | Cada conversación es una tarjeta con fecha, hora y palabras (con sus expresiones), más 🔊 para volver a escucharla |
| Ayuda | Botón **?** en cada pantalla: muestra el video en LSCh y los pasos con íconos que se iluminan uno tras otro |

## Videos de señas

Van en `public/senas/`. La lista de nombres está en `public/senas/LEEME.txt`.
Mientras no existan, se muestran los íconos. Lo ideal es que los grabe una
persona sorda o un intérprete de LSCh.

## Limitaciones del prototipo

- **El PIN de 4 números es cómodo pero débil.** Para una versión real habría
  que limitar los intentos en el backend.
- **Los perfiles de animal se guardan en cada dispositivo.** En otro teléfono
  hay que entrar con usuario y contraseña, desde el ícono de teclado.
- **Vibración:** funciona en Android. En iPhone el navegador no lo permite.
- **Voz:** "Leer en voz alta" usa la voz en español del navegador. "Escuchar"
  funciona en Chrome y Edge, y necesita internet.
- **Cámara y micrófono en el celular:** si la app no se abre desde
  `localhost`, el navegador exige HTTPS.
- **Leer la cara cuesta más al teléfono.** La cara se analiza en uno de cada
  dos cuadros; en teléfonos lentos se puede apagar tocando la carita.
