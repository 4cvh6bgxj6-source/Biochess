import type { BotId, MoveQuality, PieceColor } from './types';

export type BotMoveEvent =
  | 'capture_queen'
  | 'check_given'
  | 'bot_checked'
  | 'checkmate_win'
  | 'checkmate_loss'
  | 'alien_gambit';

type LangCode = 'it' | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ru' | 'zh' | 'ja' | 'ko' | 'ar';

function normLang(raw?: string): LangCode {
  const s = (raw || 'en').toLowerCase().trim();
  const valid: LangCode[] = ['it', 'en', 'es', 'fr', 'de', 'pt', 'ru', 'zh', 'ja', 'ko', 'ar'];
  return (valid.includes(s as LangCode) ? s : 'en') as LangCode;
}

const ALIEN_INTRO =
  'Witty is an alien and he kinda crazy, coming from the universe and party and go crazy! 🛸';

interface BotLocalePack {
  greetings: Record<BotId, (u: string) => string>;
  blunder: Record<BotId, string>;
  brilliant: Record<BotId, string>;
  great: Record<BotId, string>;
  captureQueen: { gotham: string; mittens: string; master: string; alien: string; def: string };
  checkGiven: { mittens: string; alien: string; def: string };
  botChecked: { knight: string; gotham: string; mittens: string; def: string };
  checkmateWin: { mittens: string; gotham: string; alien: string; master: string; def: string };
  checkmateLoss: { dummy: string; gotham: string; mittens: string; master: string; alien: string; def: string };
  alienGambit: string;
  drawAcceptBot: string;
  drawDeclineBot: string;
  useDrawBtn: string;
  blunderReply: { gotham: string; mittens: string; pos: string; neg: string };
  ggReply: { gotham: string; mittens: string; master: string; king: string; def: string };
  helloReply: Record<BotId, string>;
  shortLines: Record<BotId, string[]>;
}

const PACKS: Record<LangCode, BotLocalePack> = {
  it: {
    greetings: {
      knight: (u) => `Ciao ${u}! Pronto a salvare la tua serie su Duolingo? Buona partita!`,
      bishop: (u) => `Ciao ${u}, buona partita sotto la Luna!`,
      king: (u) => `Ehilà ${u}! Sono Martin, giochiamo una bella partita!`,
      master: (u) => `${u}. Mostra il tuo miglior gioco.`,
      dummy: (u) =>
        `Modalità Dummy attiva, ${u}! Muovi tu sia i tuoi pezzi che il Dummy e guarda la revisione.`,
      alien: (u) => `${ALIEN_INTRO} Benvenuto nell'orbita, ${u}!`,
      gothamchess: (u) => `Ehi ${u}! Pronto per THE ROOOOK? Facciamo una grande partita!`,
      mittens: (u) =>
        `Miao, ${u}... La pazienza vede ciò che la fretta ignora. Cerchiamo la verità sulle sessantaquattro case.`,
    },
    blunder: {
      knight: 'Ops! Hai perso una vita (??)',
      bishop: 'Ahi, blunder (??).',
      king: 'Ehi, sicurezza dei pezzi! Blunder (??).',
      master: 'Errore decisivo.',
      dummy: 'Occhio! Controlliamo questa mossa nella revisione.',
      alien: 'Anomalia cosmica rilevata!! Qui si balla nello spazio!',
      gothamchess: 'OH NO! Che stai facendo?! La rivediamo!',
      mittens:
        'Miao... Un solo passo distratto disfa una montagna di pazienza. Osserva con calma ciò che hai lasciato indietro.',
    },
    brilliant: {
      knight: 'Che mossa da 100 XP!!',
      bishop: 'Brillante (!!)',
      king: 'Sacrificio preciso (!!).',
      master: 'Mossa notevole.',
      dummy: 'Mossa fantastica!!',
      alien: 'Calcolo intergalattico!! Pazzesco!',
      gothamchess: 'SACRIFICA TUTTO!! Che mossa!!',
      mittens:
        'Miao... Anche un vecchio gatto saggio inchina il capo davanti a un sacrificio nato dalla chiarezza mentale.',
    },
    great: {
      knight: 'Ottima mossa!',
      bishop: 'Trovata unica (!)',
      king: 'Esatta (!).',
      master: 'Precisa.',
      dummy: 'Ottima trovata!',
      alien: 'Precisione orbitale!',
      gothamchess: 'Trovata unica! Bellissima!',
      mittens:
        'Miao... Saggio è chi trova l’unica pietra stabile in mezzo al fiume.',
    },
    captureQueen: {
      gotham: 'PRESO LA DONNA!',
      mittens: 'Miao... Quando il cuore è troppo ambizioso, anche la Regina cade.',
      master: 'La Donna cade.',
      alien: 'Donna teletrasportata fuori dalla scacchiera! 🛸',
      def: 'Presa la Donna!',
    },
    checkGiven: {
      mittens: 'Scacco... Il silenzio prima della tempesta insegna più di mille parole.',
      alien: 'Scacco dallo spazio! 🛸',
      def: 'Scacco!',
    },
    botChecked: {
      knight: 'Bel scacco!',
      gotham: 'Scacco eh? Vediamo!',
      mittens: 'Miao... Un avvertimento gentile. Il Re saggio non teme la pressione.',
      def: 'Scacco...',
    },
    checkmateWin: {
      mittens:
        'Scacco matto. Miao... La vittoria appartiene a chi legge l’armonia della scacchiera prima ancora di toccare un pezzo.',
      gotham: 'SCACCO MATTO! Gg! Guarda l’analisi!',
      alien: 'Scacco matto cosmico! Party nello spazio! 🛸',
      master: 'Scacco matto. Partita conclusa.',
      def: 'Scacco matto! Gg.',
    },
    checkmateLoss: {
      dummy: 'Grande matto! Ottimo allenamento, guarda la revisione.',
      gotham: 'GG! Mi hai incastrato! Ottima partita!',
      mittens:
        'Miao... Ben giocato, saggio viaggiatore. Oggi la tua visione ha superato la mia.',
      master: 'Ben giocato. Hai trovato la vittoria.',
      alien: 'Mi hai battuto! Sei più folle dell’universo! GG 🛸',
      def: 'Gg! Ben giocato.',
    },
    alienGambit: 'ALIEN GAMBIT!! Sacrificio in f7 dallo spazio!! 🛸🔥',
    drawAcceptBot: 'Va bene, accettiamo la patta! Bella partita.',
    drawDeclineBot: 'Continuiamo a giocare, c’è ancora molto sulla scacchiera.',
    useDrawBtn: 'Usa il tasto Patta.',
    blunderReply: {
      gotham: 'Succede anche ai GM! Guarda la revisione!',
      mittens:
        'Miao... Ogni maestro porta le cicatrici di mille errori. Non temerli: imparali.',
      pos: 'Capita!',
      neg: 'Succede a tutti.',
    },
    ggReply: {
      gotham: 'GG! Bella sfida!',
      mittens: 'Miao... L’onore resta sulla scacchiera anche dopo l’ultima mossa.',
      master: 'Gg.',
      king: 'Gg, bella sfida!',
      def: 'Grazie! Gg!',
    },
    helloReply: {
      gothamchess: 'Ciao! Pronto a sacrificare THE ROOOOK?',
      mittens:
        'Miao... Saluti, cercatore di verità. Che ogni tua mossa abbia uno scopo.',
      alien: `${ALIEN_INTRO}`,
      dummy: 'Ciao! Sono qui per farti allenare in tranquillità.',
      master: 'Concentrati sulla scacchiera.',
      king: 'Ciao! I miei figli tifano per me oggi!',
      bishop: 'Ciao! Buona partita!',
      knight: 'Ciao! Non perdere la tua serie oggi!',
    },
    shortLines: {
      dummy: [
        'Prova a controllare le case centrali e4, d4, e5, d5!',
        'Cerca forchette, inchiodature o pezzi indifesi!',
        'Ricorda di arroccare per mettere al sicuro il tuo Re.',
      ],
      alien: [
        'Energia cosmica sulla scacchiera! 🛸',
        'Occhio alla casa f7... gli alieni attaccano sempre!',
        'Party nello spazio, ogni sacrificio vale!',
        'Avanti terrestre, fammi vedere la tua tattica!',
      ],
      gothamchess: [
        'THE ROOOOK!',
        'Controlla le minacce!',
        'Sviluppa tutti i pezzi!',
        'Interessante... vediamo!',
      ],
      mittens: [
        'Miao... La fretta genera illusioni; la profondità genera vittorie.',
        'Ogni pedone spinto cambia il destino del finale.',
        'Il vero maestro vince nella mente prima ancora che sulla tavola.',
        'Osserva le case deboli: è lì che si nasconde la verità della posizione.',
        'Miao... La calma è la lama più affilata degli scacchi.',
      ],
      master: ['Mossa solida.', 'Calcola più a fondo.', 'Ogni debolezza conta.', 'Avanti.'],
      knight: ['Non perdere la serie!', 'Ottimo allenamento!', 'Tocca a te!', 'Continua così!'],
      bishop: ['Mh, interessante.', 'Vediamo il seguito.', 'Buon ritmo.', 'Gioco aperto.'],
      king: ['Bella mossa!', 'Calcola bene.', 'Mi piace questa posizione.', 'Avanti!'],
    },
  },

  en: {
    greetings: {
      knight: (u) => `Hey ${u}! Ready to protect your Duolingo streak? Have a great game!`,
      bishop: (u) => `Hi ${u}, enjoy a calm game under the Moon!`,
      king: (u) => `Hey there ${u}! I'm Martin, let's play a fun match!`,
      master: (u) => `${u}. Show me your finest chess.`,
      dummy: (u) =>
        `Dummy training active, ${u}! Move both sides freely and check your move review.`,
      alien: (u) => `${ALIEN_INTRO} Welcome to orbit, ${u}!`,
      gothamchess: (u) => `Hey ${u}! Ready to sacrifice THE ROOOOK? Let's go!`,
      mittens: (u) =>
        `Meow, ${u}... Patience perceives what haste overlooks. Let us seek the truth upon these sixty-four squares.`,
    },
    blunder: {
      knight: 'Oops! You just lost a heart (??)',
      bishop: 'Ouch, that is a blunder (??).',
      king: 'Hey, watch piece safety! Blunder (??).',
      master: 'A decisive mistake.',
      dummy: 'Watch out! Check the review panel for the best move.',
      alien: 'Cosmic anomaly detected!! Space party time!',
      gothamchess: 'OH NO! What are you doing?! Check the review!',
      mittens:
        'Meow... One careless step unravels a mountain of patience. Reflect quietly upon what you left behind.',
    },
    brilliant: {
      knight: 'That move is worth 100 XP!!',
      bishop: 'Brilliant (!!)',
      king: 'Sharp sacrifice (!!).',
      master: 'Remarkable move.',
      dummy: 'Fantastic move!!',
      alien: 'Intergalactic calculation!! Pure madness!',
      gothamchess: 'SACRIFICE EVERYTHING!! What a move!!',
      mittens:
        'Meow... Even an ancient sage cat bows before a sacrifice born of crystal clarity.',
    },
    great: {
      knight: 'Great move!',
      bishop: 'Only move (!)',
      king: 'Exact (!).',
      master: 'Accurate.',
      dummy: 'Great find!',
      alien: 'Orbital precision!',
      gothamchess: 'Only move! Gorgeous!',
      mittens:
        'Meow... Wise is the player who finds the single steady stone across a rushing river.',
    },
    captureQueen: {
      gotham: 'TOOK THE QUEEN!',
      mittens: 'Meow... When ambition outruns defense, even the Queen must fall.',
      master: 'The Queen falls.',
      alien: 'Queen abducted by UFO! 🛸',
      def: 'Captured the Queen!',
    },
    checkGiven: {
      mittens: 'Check... The quiet before the storm teaches more than a thousand words.',
      alien: 'Check from outer space! 🛸',
      def: 'Check!',
    },
    botChecked: {
      knight: 'Nice check!',
      gotham: 'Check, huh? Let us see!',
      mittens: 'Meow... A gentle reminder. The wise King never fears pressure.',
      def: 'Check...',
    },
    checkmateWin: {
      mittens:
        'Checkmate. Meow... Victory belongs to the mind that sees the board’s harmony long before touching a piece.',
      gotham: 'CHECKMATE! GG! Open the review!',
      alien: 'Cosmic checkmate! Universe party time! 🛸',
      master: 'Checkmate. Game over.',
      def: 'Checkmate! GG.',
    },
    checkmateLoss: {
      dummy: 'Awesome checkmate! Great training, inspect the review!',
      gotham: 'GG! You trapped me! Great game!',
      mittens:
        'Meow... Well played, wise traveler. Today your vision saw deeper than mine.',
      master: 'Well played. You earned that victory.',
      alien: 'You got me! You are crazier than the universe! GG 🛸',
      def: 'GG! Well played.',
    },
    alienGambit: 'ALIEN GAMBIT!! Nxf7 straight from the universe!! 🛸🔥',
    drawAcceptBot: 'Alright, draw accepted! Good game.',
    drawDeclineBot: 'Let us keep playing, there is still plenty left on the board.',
    useDrawBtn: 'Use the Draw button.',
    blunderReply: {
      gotham: 'Happens even to GMs! Check the review!',
      mittens:
        'Meow... Every master carries the wisdom of a thousand blunders. Do not fear them—learn from them.',
      pos: 'It happens!',
      neg: 'Happens to everyone.',
    },
    ggReply: {
      gotham: 'GG! Great battle!',
      mittens: 'Meow... Honor remains upon the board long after the final move.',
      master: 'GG.',
      king: 'GG, fun match!',
      def: 'Thanks! GG!',
    },
    helloReply: {
      gothamchess: 'Hey! Ready to sacrifice THE ROOOOK?',
      mittens:
        'Meow... Greetings, seeker of truth. May every move carry purpose.',
      alien: `${ALIEN_INTRO}`,
      dummy: 'Hey! Practice freely—move both sides and learn!',
      master: 'Focus on the board.',
      king: 'Hi! My kids are cheering for me today!',
      bishop: 'Hello! Good luck!',
      knight: 'Hi! Do not lose your streak today!',
    },
    shortLines: {
      dummy: [
        'Try controlling the center squares e4, d4, e5, d5!',
        'Look for forks, pins, and undefended pieces!',
        'Remember to castle early to keep your King safe.',
      ],
      alien: [
        'Cosmic energy on the board! 🛸',
        'Watch f7... aliens always look for crazy gambits!',
        'Coming from the universe to party on these 64 squares!',
        'Your move, earthling—show me your wildest tactics!',
      ],
      gothamchess: [
        'THE ROOOOK!',
        'Check all opponent threats!',
        'Develop all your pieces!',
        'Interesting... let us see!',
      ],
      mittens: [
        'Meow... Haste breeds illusions; depth breeds mastery.',
        'Every pawn push reshapes the distant endgame.',
        'A true master wins in thought before a single piece is lifted.',
        'Observe the weak squares—there hides the secret of the position.',
        'Meow... Calmness is the sharpest blade in chess.',
      ],
      master: ['Solid move.', 'Calculate deeper.', 'Every weakness matters.', 'Your turn.'],
      knight: ['Keep your streak alive!', 'Great practice!', 'Your turn!', 'Keep it up!'],
      bishop: ['Hmm, interesting.', 'Let us see the follow-up.', 'Good pace.', 'Open game.'],
      king: ['Nice move!', 'Calculate carefully.', 'I like this position.', 'Your turn!'],
    },
  },

  es: {
    greetings: {
      knight: (u) => `¡Hola ${u}! ¿Listo para salvar tu racha de Duolingo? ¡Buena partida!`,
      bishop: (u) => `Hola ${u}, ¡buena partida bajo la Luna!`,
      king: (u) => `¡Hola ${u}! Soy Martin, ¡juguemos una gran partida!`,
      master: (u) => `${u}. Muéstrame tu mejor ajedrez.`,
      dummy: (u) => `¡Modo Dummy activo, ${u}! Mueve ambos bandos y revisa tus jugadas.`,
      alien: (u) => `${ALIEN_INTRO} ¡Bienvenido a la órbita, ${u}!`,
      gothamchess: (u) => `¡Hola ${u}! ¿Listo para sacrificar THE ROOOOK?`,
      mittens: (u) =>
        `Miau, ${u}... La paciencia ve lo que la prisa ignora. Busquemos la verdad en estas sesenta y cuatro casillas.`,
    },
    blunder: {
      knight: '¡Ups! Perdiste una vida (??)',
      bishop: 'Ay, error grave (??).',
      king: '¡Cuidado con tus piezas! Error grave (??).',
      master: 'Error decisivo.',
      dummy: '¡Cuidado! Revisa esta jugada en el panel de análisis.',
      alien: '¡Anomalía cósmica detectada! 🛸',
      gothamchess: '¡OH NO! ¿Qué haces? ¡Mira la revisión!',
      mittens:
        'Miau... Un solo paso descuidado deshace una montaña de paciencia. Reflexiona con calma.',
    },
    brilliant: {
      knight: '¡Jugada de 100 XP!!',
      bishop: '¡Brillante (!!)',
      king: 'Sacrificio exacto (!!).',
      master: 'Jugada notable.',
      dummy: '¡¡Jugada fantástica!!',
      alien: '¡¡Cálculo intergaláctico!! ¡Pura locura!',
      gothamchess: '¡¡SACRIFICA TODO!! ¡Qué jugada!',
      mittens:
        'Miau... Hasta un viejo gato sabio se inclina ante un sacrificio nacido de la claridad.',
    },
    great: {
      knight: '¡Gran jugada!',
      bishop: '¡Única jugada (!)',
      king: 'Exacta (!).',
      master: 'Precisa.',
      dummy: '¡Buen hallazgo!',
      alien: '¡Precisión orbital!',
      gothamchess: '¡Única jugada! ¡Hermosa!',
      mittens: 'Miau... Sabio es quien encuentra la única piedra firme en medio del río.',
    },
    captureQueen: {
      gotham: '¡CAZADA LA DAMA!',
      mittens: 'Miau... Cuando la ambición supera a la defensa, hasta la Dama cae.',
      master: 'Cae la Dama.',
      alien: '¡Dama abducida por un OVNI! 🛸',
      def: '¡Dama capturada!',
    },
    checkGiven: {
      mittens: 'Jaque... El silencio antes de la tormenta enseña más que mil palabras.',
      alien: '¡Jaque desde el espacio! 🛸',
      def: '¡Jaque!',
    },
    botChecked: {
      knight: '¡Buen jaque!',
      gotham: '¿Jaque eh? ¡Veamos!',
      mittens: 'Miau... Un recordatorio amable. El Rey sabio nunca teme la presión.',
      def: 'Jaque...',
    },
    checkmateWin: {
      mittens:
        'Jaque mate. Miau... La victoria pertenece a quien comprende la armonía del tablero antes de mover.',
      gotham: '¡JAQUE MATE! ¡GG! ¡Revisa la partida!',
      alien: '¡Jaque mate cósmico! ¡Fiesta espacial! 🛸',
      master: 'Jaque mate. Partida terminada.',
      def: '¡Jaque mate! GG.',
    },
    checkmateLoss: {
      dummy: '¡Gran mate! Buen entrenamiento, mira la revisión.',
      gotham: '¡GG! ¡Me atrapaste! ¡Gran partida!',
      mittens: 'Miau... Bien jugado, sabio viajero. Hoy tu visión fue más profunda que la mía.',
      master: 'Bien jugado. Mereciste la victoria.',
      alien: '¡Me ganaste! ¡Estás más loco que el universo! GG 🛸',
      def: '¡GG! Bien jugado.',
    },
    alienGambit: '¡¡ALIEN GAMBIT!! ¡Cxf7 directo desde el universo!! 🛸🔥',
    drawAcceptBot: 'De acuerdo, ¡tablas aceptadas! Buena partida.',
    drawDeclineBot: 'Sigamos jugando, aún queda mucho en el tablero.',
    useDrawBtn: 'Usa el botón de Tablas.',
    blunderReply: {
      gotham: '¡Le pasa hasta a los GM! ¡Mira la revisión!',
      mittens: 'Miau... Todo maestro carga la sabiduría de mil errores. Apréndelos sin temor.',
      pos: '¡Suele pasar!',
      neg: 'Nos pasa a todos.',
    },
    ggReply: {
      gotham: '¡GG! ¡Gran batalla!',
      mittens: 'Miau... El honor permanece en el tablero incluso tras la última jugada.',
      master: 'GG.',
      king: '¡GG, buen reto!',
      def: '¡Gracias! ¡GG!',
    },
    helloReply: {
      gothamchess: '¡Hola! ¿Listo para sacrificar THE ROOOOK?',
      mittens: 'Miau... Saludos, buscador de la verdad. Que cada jugada tenga propósito.',
      alien: `${ALIEN_INTRO}`,
      dummy: '¡Hola! Practica libremente moviendo ambos bandos.',
      master: 'Concéntrate en el tablero.',
      king: '¡Hola! ¡Mis hijos me animan hoy!',
      bishop: '¡Hola! ¡Buena partida!',
      knight: '¡Hola! ¡No pierdas tu racha hoy!',
    },
    shortLines: {
      dummy: [
        '¡Intenta controlar el centro: e4, d4, e5, d5!',
        '¡Busca ataques dobles, clavadas o piezas sin defensa!',
        'Recuerda enrocar pronto para proteger a tu Rey.',
      ],
      alien: [
        '¡Energía cósmica en el tablero! 🛸',
        'Ojo con f7... ¡los aliens siempre atacan!',
        '¡Fiesta desde el universo en las 64 casillas!',
        'Tu turno, terrícola, ¡muéstrame tu táctica!',
      ],
      gothamchess: ['¡THE ROOOOK!', '¡Vigila las amenazas!', '¡Desarrolla tus piezas!', '¡Interesante!'],
      mittens: [
        'Miau... La prisa crea ilusiones; la profundidad crea maestría.',
        'Cada avance de peón transforma el destino del final.',
        'Un verdadero maestro vence en la mente antes de tocar una pieza.',
        'Observa las casillas débiles: allí reside la verdad de la posición.',
      ],
      master: ['Jugada sólida.', 'Calcula más profundo.', 'Cada debilidad cuenta.', 'Tu turno.'],
      knight: ['¡Mantén tu racha!', '¡Buen entreno!', '¡Tu turno!', '¡Sigue así!'],
      bishop: ['Mmm, interesante.', 'Veamos qué sigue.', 'Buen ritmo.', 'Partida abierta.'],
      king: ['¡Buena jugada!', 'Calcula bien.', 'Me gusta esta posición.', '¡Adelante!'],
    },
  },

  fr: {
    greetings: {
      knight: (u) => `Salut ${u} ! Prêt à sauver ta série Duolingo ? Bonne partie !`,
      bishop: (u) => `Salut ${u}, bonne partie sous la Lune !`,
      king: (u) => `Salut ${u} ! Je suis Martin, faisons une belle partie !`,
      master: (u) => `${u}. Montre-moi ton meilleur niveau.`,
      dummy: (u) => `Mode Dummy actif, ${u} ! Joue les deux camps et analyse chaque coup.`,
      alien: (u) => `${ALIEN_INTRO} Bienvenue en orbite, ${u} !`,
      gothamchess: (u) => `Salut ${u} ! Prêt pour THE ROOOOK ?`,
      mittens: (u) =>
        `Miaou, ${u}... La patience voit ce que la hâte ignore. Cherchons la vérité sur ces soixante-quatre cases.`,
    },
    blunder: {
      knight: 'Oups ! Tu as perdu une vie (??)',
      bishop: 'Aïe, grosse gaffe (??).',
      king: 'Attention à la sécurité de tes pièces ! Gaffe (??).',
      master: 'Erreur décisive.',
      dummy: 'Attention ! Vérifie ce coup dans l’analyse.',
      alien: 'Anomalie cosmique détectée !! 🛸',
      gothamchess: 'OH NON ! Mais que fais-tu ?! Regarde l’analyse !',
      mittens:
        'Miaou... Un seul pas distrait défait une montagne de patience. Médite calmement sur ce choix.',
    },
    brilliant: {
      knight: 'Un coup à 100 XP !!',
      bishop: 'Brillant (!!)',
      king: 'Sacrifice précis (!!).',
      master: 'Coup remarquable.',
      dummy: 'Coup fantastique !!',
      alien: 'Calcul intergalactique !! Totalement fou !',
      gothamchess: 'SACRIFICE TOTAL !! Quel coup !!',
      mittens:
        'Miaou... Même un vieux chat sage s’incline devant un sacrifice né de la lucidité.',
    },
    great: {
      knight: 'Super coup !',
      bishop: 'Coup unique (!)',
      king: 'Exact (!).',
      master: 'Précis.',
      dummy: 'Belle trouvaille !',
      alien: 'Précision orbitale !',
      gothamchess: 'Coup unique ! Magnifique !',
      mittens: 'Miaou... Sage est celui qui trouve l’unique pierre stable au milieu du torrent.',
    },
    captureQueen: {
      gotham: 'DAME CAPTURÉE !',
      mittens: 'Miaou... Quand l’ambition dépasse la prudence, même la Dame tombe.',
      master: 'La Dame tombe.',
      alien: 'Dame kidnappée par soucoupe ! 🛸',
      def: 'Dame prise !',
    },
    checkGiven: {
      mittens: 'Échec... Le silence avant la tempête en dit plus long que mille mots.',
      alien: 'Échec venu de l’espace ! 🛸',
      def: 'Échec !',
    },
    botChecked: {
      knight: 'Joli échec !',
      gotham: 'Échec hein ? Voyons voir !',
      mittens: 'Miaou... Un doux avertissement. Le Roi sage ne craint pas la pression.',
      def: 'Échec...',
    },
    checkmateWin: {
      mittens:
        'Échec et mat. Miaou... La victoire appartient à l’esprit qui perçoit l’harmonie avant même de jouer.',
      gotham: 'ÉCHEC ET MAT ! GG ! Ouvre la révision !',
      alien: 'Échec et mat cosmique ! Fête galactique ! 🛸',
      master: 'Échec et mat. Fin de partie.',
      def: 'Échec et mat ! GG.',
    },
    checkmateLoss: {
      dummy: 'Super mat ! Excellent entraînement !',
      gotham: 'GG ! Tu m’as piégé ! Belle partie !',
      mittens: 'Miaou... Bien joué, sage voyageur. Aujourd’hui ta vision a surpassé la mienne.',
      master: 'Bien joué. Tu mérites cette victoire.',
      alien: 'Tu m’as eu ! Plus fou que l’univers ! GG 🛸',
      def: 'GG ! Bien joué.',
    },
    alienGambit: 'ALIEN GAMBIT !! Cxf7 venu de l’espace !! 🛸🔥',
    drawAcceptBot: 'D’accord, nulle acceptée ! Belle partie.',
    drawDeclineBot: 'Continuons, il reste encore beaucoup de jeu sur l’échiquier.',
    useDrawBtn: 'Utilise le bouton Nulle.',
    blunderReply: {
      gotham: 'Ça arrive même aux GM ! Regarde l’analyse !',
      mittens: 'Miaou... Chaque maître porte la sagesse de mille erreurs. Apprends-en sans peur.',
      pos: 'Ça arrive !',
      neg: 'Tout le monde en fait.',
    },
    ggReply: {
      gotham: 'GG ! Belle bataille !',
      mittens: 'Miaou... L’honneur demeure sur l’échiquier après le dernier coup.',
      master: 'GG.',
      king: 'GG, beau défi !',
      def: 'Merci ! GG !',
    },
    helloReply: {
      gothamchess: 'Salut ! Prêt à sacrifier THE ROOOOK ?',
      mittens: 'Miaou... Salutations, chercheur de vérité. Que chaque coup ait un sens.',
      alien: `${ALIEN_INTRO}`,
      dummy: 'Salut ! Entraîne-toi librement en jouant les deux camps.',
      master: 'Concentre-toi sur l’échiquier.',
      king: 'Salut ! Mes enfants m’encouragent aujourd’hui !',
      bishop: 'Bonjour ! Bonne partie !',
      knight: 'Salut ! Ne perds pas ta série aujourd’hui !',
    },
    shortLines: {
      dummy: [
        'Essaie de contrôler le centre : e4, d4, e5, d5 !',
        'Cherche les fourchettes, clouages et pièces sans défense !',
        'Pense à roquer tôt pour protéger ton Roi.',
      ],
      alien: [
        'Énergie cosmique sur l’échiquier ! 🛸',
        'Méfie-toi de f7... les aliens adorent attaquer !',
        'Fête cosmique sur les 64 cases !',
        'À toi Terrien, montre-moi ta tactique !',
      ],
      gothamchess: ['THE ROOOOK !', 'Surveille les menaces !', 'Développe tes pièces !', 'Intéressant !'],
      mittens: [
        'Miaou... La hâte crée des illusions ; la profondeur crée la maîtrise.',
        'Chaque pion poussé redessine la finale.',
        'Un vrai maître gagne en pensée avant même de toucher une pièce.',
        'Observe les cases faibles : là réside la vérité de la position.',
      ],
      master: ['Coup solide.', 'Calcule plus loin.', 'Chaque faiblesse compte.', 'À toi.'],
      knight: ['Garde ta série !', 'Bon entraînement !', 'À toi !', 'Continue !'],
      bishop: ['Hmm, intéressant.', 'Voyons la suite.', 'Bon rythme.', 'Jeu ouvert.'],
      king: ['Beau coup !', 'Calcule bien.', 'J’aime cette position.', 'À toi !'],
    },
  },

  de: {
    greetings: {
      knight: (u) => `Hallo ${u}! Bereit für deine Duolingo-Serie? Viel Spaß!`,
      bishop: (u) => `Hallo ${u}, viel Erfolg im Mondlicht!`,
      king: (u) => `Hey ${u}! Ich bin Martin, lass uns eine schöne Partie spielen!`,
      master: (u) => `${u}. Zeige mir dein bestes Schach.`,
      dummy: (u) => `Dummy-Modus aktiv, ${u}! Ziehe beide Seiten frei und prüfe die Analyse.`,
      alien: (u) => `${ALIEN_INTRO} Willkommen im Orbit, ${u}!`,
      gothamchess: (u) => `Hey ${u}! Bereit für THE ROOOOK?`,
      mittens: (u) =>
        `Miau, ${u}... Geduld erkennt, was Eile übersieht. Suchen wir die Wahrheit auf diesen vierundsechzig Feldern.`,
    },
    blunder: {
      knight: 'Ups! Ein Leben verloren (??)',
      bishop: 'Autsch, grober Patzer (??).',
      king: 'Achte auf deine Figuren! Patzer (??).',
      master: 'Entscheidender Fehler.',
      dummy: 'Vorsicht! Schau dir diesen Zug in der Analyse an.',
      alien: 'Kosmische Anomalie entdeckt!! 🛸',
      gothamchess: 'OH NEIN! Was machst du da?! Schau in die Analyse!',
      mittens:
        'Miau... Ein unbedachter Schritt zerstört einen Berg an Geduld. Denke ruhig darüber nach.',
    },
    brilliant: {
      knight: '100-XP-Zug!!',
      bishop: 'Brillant (!!)',
      king: 'Präzises Opfer (!!).',
      master: 'Bemerkenswerter Zug.',
      dummy: 'Fantastischer Zug!!',
      alien: 'Intergalaktische Berechnung!! Wahnsinn!',
      gothamchess: 'OPFERE ALLES!! Was für ein Zug!!',
      mittens: 'Miau... Selbst eine alte weise Katze verneigt sich vor einem klaren Opfer.',
    },
    great: {
      knight: 'Starker Zug!',
      bishop: 'Einziger Zug (!)',
      king: 'Exakt (!).',
      master: 'Präzise.',
      dummy: 'Stark gefunden!',
      alien: 'Orbitale Präzision!',
      gothamchess: 'Einziger Zug! Wunderschön!',
      mittens: 'Miau... Weise ist, wer den einzigen festen Stein im reißenden Fluss findet.',
    },
    captureQueen: {
      gotham: 'DAME GESCHNAPPT!',
      mittens: 'Miau... Wenn Ehrgeiz die Verteidigung überholt, fällt selbst die Dame.',
      master: 'Die Dame fällt.',
      alien: 'Dame vom UFO entführt! 🛸',
      def: 'Dame geschlagen!',
    },
    checkGiven: {
      mittens: 'Schach... Die Stille vor dem Sturm lehrt mehr als tausend Worte.',
      alien: 'Schach aus dem All! 🛸',
      def: 'Schach!',
    },
    botChecked: {
      knight: 'Schönes Schach!',
      gotham: 'Schach, ja? Mal sehen!',
      mittens: 'Miau... Eine sanfte Mahnung. Der weise König fürchtet keinen Druck.',
      def: 'Schach...',
    },
    checkmateWin: {
      mittens:
        'Schachmatt. Miau... Der Sieg gehört dem Geist, der die Harmonie sieht, bevor er zieht.',
      gotham: 'SCHACHMATT! GG! Öffne die Analyse!',
      alien: 'Kosmisches Schachmatt! Weltraum-Party! 🛸',
      master: 'Schachmatt. Partie beendet.',
      def: 'Schachmatt! GG.',
    },
    checkmateLoss: {
      dummy: 'Tolles Matt! Starkes Training!',
      gotham: 'GG! Du hast mich erwischt! Starke Partie!',
      mittens: 'Miau... Gut gespielt, weiser Reisender. Heute sahst du tiefer als ich.',
      master: 'Gut gespielt. Verdienter Sieg.',
      alien: 'Du hast mich! Verrückter als das Universum! GG 🛸',
      def: 'GG! Gut gespielt.',
    },
    alienGambit: 'ALIEN GAMBIT!! Sxf7 direkt aus dem Universum!! 🛸🔥',
    drawAcceptBot: 'Einverstanden, Remis angenommen! Schöne Partie.',
    drawDeclineBot: 'Spielen wir weiter, es ist noch viel los auf dem Brett.',
    useDrawBtn: 'Nutze den Remis-Button.',
    blunderReply: {
      gotham: 'Passiert selbst GMs! Schau in die Analyse!',
      mittens: 'Miau... Jeder Meister trägt die Weisheit tausender Fehler. Lerne furchtlos.',
      pos: 'Passiert!',
      neg: 'Passiert jedem mal.',
    },
    ggReply: {
      gotham: 'GG! Toller Kampf!',
      mittens: 'Miau... Ehre bleibt auf dem Brett, auch nach dem letzten Zug.',
      master: 'GG.',
      king: 'GG, tolle Partie!',
      def: 'Danke! GG!',
    },
    helloReply: {
      gothamchess: 'Hey! Bereit, THE ROOOOK zu opfern?',
      mittens: 'Miau... Sei gegrüßt, Sucher der Wahrheit. Möge jeder Zug Sinn tragen.',
      alien: `${ALIEN_INTRO}`,
      dummy: 'Hallo! Trainiere frei auf beiden Seiten.',
      master: 'Konzentriere dich auf das Brett.',
      king: 'Hallo! Meine Kinder feuern mich heute an!',
      bishop: 'Hallo! Viel Spaß!',
      knight: 'Hallo! Verliere heute nicht deine Serie!',
    },
    shortLines: {
      dummy: [
        'Kontrolliere das Zentrum: e4, d4, e5, d5!',
        'Suche nach Gabeln, Fesselungen und ungedeckten Figuren!',
        'Rochiere früh, um deinen König zu schützen.',
      ],
      alien: [
        'Kosmische Energie auf dem Brett! 🛸',
        'Pass auf f7 auf... Aliens greifen immer an!',
        'Weltraum-Party auf 64 Feldern!',
        'Dein Zug, Erdling—zeig mir deine Taktik!',
      ],
      gothamchess: ['THE ROOOOK!', 'Prüfe alle Drohungen!', 'Entwickle alle Figuren!', 'Interessant!'],
      mittens: [
        'Miau... Eile erzeugt Illusionen; Tiefe erzeugt Meisterschaft.',
        'Jeder Bauernzug formt das ferne Endspiel.',
        'Ein wahrer Meister siegt im Geist, noch bevor eine Figur bewegt wird.',
        'Achte auf schwache Felder—dort verbirgt sich die Wahrheit.',
      ],
      master: ['Solider Zug.', 'Rechne tiefer.', 'Jede Schwäche zählt.', 'Du bist dran.'],
      knight: ['Halte deine Serie!', 'Gutes Training!', 'Du bist dran!', 'Weiter so!'],
      bishop: ['Hmm, interessant.', 'Mal sehen wie es weitergeht.', 'Gutes Tempo.', 'Offenes Spiel.'],
      king: ['Schöner Zug!', 'Gut gerechnet.', 'Gefällt mir!', 'Weiter!'],
    },
  },

  pt: {
    greetings: {
      knight: (u) => `Oi ${u}! Pronto para manter sua ofensiva no Duolingo? Bom jogo!`,
      bishop: (u) => `Oi ${u}, ótimo jogo sob a Lua!`,
      king: (u) => `E aí ${u}! Sou o Martin, vamos jogar uma boa partida!`,
      master: (u) => `${u}. Mostre o seu melhor xadrez.`,
      dummy: (u) => `Modo Dummy ativo, ${u}! Mova os dois lados e veja a revisão.`,
      alien: (u) => `${ALIEN_INTRO} Bem-vindo à órbita, ${u}!`,
      gothamchess: (u) => `E aí ${u}! Pronto para sacrificar THE ROOOOK?`,
      mittens: (u) =>
        `Miau, ${u}... A paciência enxerga o que a pressa ignora. Busquemos a verdade nestas sessenta e quatro casas.`,
    },
    blunder: {
      knight: 'Ops! Perdeu uma vida (??)',
      bishop: 'Ai, erro grave (??).',
      king: 'Cuidado com a segurança das peças! Erro grave (??).',
      master: 'Erro decisivo.',
      dummy: 'Atenção! Veja o melhor lance na revisão.',
      alien: 'Anomalia cósmica detectada!! 🛸',
      gothamchess: 'OH NÃO! O que você fez?! Veja a revisão!',
      mittens: 'Miau... Um único passo descuidado desfaz uma montanha de paciência.',
    },
    brilliant: {
      knight: 'Lance de 100 XP!!',
      bishop: 'Brilhante (!!)',
      king: 'Sacrifício exato (!!).',
      master: 'Lance notável.',
      dummy: 'Lance fantástico!!',
      alien: 'Cálculo intergaláctico!! Pura loucura!',
      gothamchess: 'SACRIFICA TUDO!! Que lance!!',
      mittens: 'Miau... Até um velho gato sábio se curva diante de um sacrifício lúcido.',
    },
    great: {
      knight: 'Ótimo lance!',
      bishop: 'Lance único (!)',
      king: 'Exato (!).',
      master: 'Preciso.',
      dummy: 'Bela jogada!',
      alien: 'Precisão orbital!',
      gothamchess: 'Lance único! Lindo!',
      mittens: 'Miau... Sábio é quem encontra a única pedra firme no meio do rio.',
    },
    captureQueen: {
      gotham: 'PEGOU A DAMA!',
      mittens: 'Miau... Quando a ambição supera a defesa, até a Dama cai.',
      master: 'A Dama cai.',
      alien: 'Dama abduzida por OVNI! 🛸',
      def: 'Dama capturada!',
    },
    checkGiven: {
      mittens: 'Xeque... O silêncio antes da tempestade ensina mais que mil palavras.',
      alien: 'Xeque do espaço! 🛸',
      def: 'Xeque!',
    },
    botChecked: {
      knight: 'Belo xeque!',
      gotham: 'Xeque né? Vamos ver!',
      mittens: 'Miau... Um aviso gentil. O Rei sábio não teme pressão.',
      def: 'Xeque...',
    },
    checkmateWin: {
      mittens: 'Xeque-mate. Miau... A vitória pertence a quem vê a harmonia antes de mover.',
      gotham: 'XEQUE-MATE! GG! Abra a revisão!',
      alien: 'Xeque-mate cósmico! Festa espacial! 🛸',
      master: 'Xeque-mate. Fim de jogo.',
      def: 'Xeque-mate! GG.',
    },
    checkmateLoss: {
      dummy: 'Ótimo mate! Belo treino!',
      gotham: 'GG! Você me pegou! Bela partida!',
      mittens: 'Miau... Bem jogado, sábio viajante. Hoje sua visão superou a minha.',
      master: 'Bem jogado. Você mereceu a vitória.',
      alien: 'Você me venceu! Mais insano que o universo! GG 🛸',
      def: 'GG! Bem jogado.',
    },
    alienGambit: 'ALIEN GAMBIT!! Cxf7 direto do universo!! 🛸🔥',
    drawAcceptBot: 'Tudo bem, empate aceito! Bom jogo.',
    drawDeclineBot: 'Vamos continuar, ainda há muito jogo no tabuleiro.',
    useDrawBtn: 'Use o botão Empate.',
    blunderReply: {
      gotham: 'Acontece até com GMs! Veja a revisão!',
      mittens: 'Miau... Todo mestre carrega a sabedoria de mil erros. Aprenda sem medo.',
      pos: 'Acontece!',
      neg: 'Acontece com todo mundo.',
    },
    ggReply: {
      gotham: 'GG! Grande batalha!',
      mittens: 'Miau... A honra permanece no tabuleiro após o último lance.',
      master: 'GG.',
      king: 'GG, bom desafio!',
      def: 'Obrigado! GG!',
    },
    helloReply: {
      gothamchess: 'E aí! Pronto para sacrificar THE ROOOOK?',
      mittens: 'Miau... Saudações, buscador da verdade. Que cada lance tenha propósito.',
      alien: `${ALIEN_INTRO}`,
      dummy: 'Oi! Treine livremente movendo os dois lados.',
      master: 'Concentre-se no tabuleiro.',
      king: 'Oi! Meus filhos estão torcendo por mim hoje!',
      bishop: 'Olá! Bom jogo!',
      knight: 'Oi! Não perca sua ofensiva hoje!',
    },
    shortLines: {
      dummy: ['Controle o centro: e4, d4, e5, d5!', 'Procure garfos e cravadas!', 'Faça o roque cedo!'],
      alien: ['Energia cósmica! 🛸', 'Olho em f7!', 'Festa nas 64 casas!', 'Sua vez, terráqueo!'],
      gothamchess: ['THE ROOOOK!', 'Veja as ameaças!', 'Desenvolva as peças!', 'Interessante!'],
      mittens: [
        'Miau... A pressa gera ilusões; a profundidade gera maestria.',
        'Cada avanço de peão molda o destino do final.',
        'Um verdadeiro mestre vence na mente antes de tocar na peça.',
        'Observe as casas fracas—ali mora a verdade da posição.',
      ],
      master: ['Lance sólido.', 'Calcule mais fundo.', 'Cada fraqueza conta.', 'Sua vez.'],
      knight: ['Mantenha a sequência!', 'Bom treino!', 'Sua vez!', 'Continue!'],
      bishop: ['Hmm, interessante.', 'Vamos ver a sequência.', 'Bom ritmo.', 'Jogo aberto.'],
      king: ['Belo lance!', 'Calcule bem.', 'Gosto dessa posição.', 'Vamos lá!'],
    },
  },

  ru: {
    greetings: {
      knight: (u) => `Привет, ${u}! Готов сохранить серию в Duolingo? Удачи!`,
      bishop: (u) => `Привет, ${u}, хорошей игры под Луной!`,
      king: (u) => `Привет, ${u}! Я Мартин, давай сыграем хорошую партию!`,
      master: (u) => `${u}. Покажи свою лучшую игру.`,
      dummy: (u) => `Режим Dummy активен, ${u}! Ходи за обе стороны и смотри разбор.`,
      alien: (u) => `${ALIEN_INTRO} Добро пожаловать на орбиту, ${u}!`,
      gothamchess: (u) => `Привет, ${u}! Готов пожертвовать THE ROOOOK?`,
      mittens: (u) =>
        `Мяу, ${u}... Терпение видит то, что упускает спешка. Поищем истину на этих шестидесяти четырёх клетках.`,
    },
    blunder: {
      knight: 'Упс! Ты потерял жизнь (??)',
      bishop: 'Ой, зевок (??).',
      king: 'Следи за безопасностью фигур! Зевок (??).',
      master: 'Решающая ошибка.',
      dummy: 'Осторожно! Проверь этот ход в разборе.',
      alien: 'Обнаружена космическая аномалия!! 🛸',
      gothamchess: 'О НЕТ! Что ты делаешь?! Смотри разбор!',
      mittens: 'Мяу... Один неосторожный шаг разрушает гору терпения. Поразмышляй в тишине.',
    },
    brilliant: {
      knight: 'Ход на 100 XP!!',
      bishop: 'Блестяще (!!)',
      king: 'Точная жертва (!!).',
      master: 'Сильный ход.',
      dummy: 'Фантастический ход!!',
      alien: 'Межгалактический расчёт!! Безумие!',
      gothamchess: 'ЖЕРТВУЙ ВСЁ!! Какой ход!!',
      mittens: 'Мяу... Даже старый мудрый кот склоняет голову перед жертвой, рождённой ясностью ума.',
    },
    great: {
      knight: 'Отличный ход!',
      bishop: 'Единственный ход (!)',
      king: 'Точно (!).',
      master: 'Чётко.',
      dummy: 'Отличная находка!',
      alien: 'Орбитальная точность!',
      gothamchess: 'Единственный ход! Красота!',
      mittens: 'Мяу... Мудр тот, кто находит единственный крепкий камень посреди бурной реки.',
    },
    captureQueen: {
      gotham: 'ФЕРЗЬ ПОЙМАН!',
      mittens: 'Мяу... Когда амбиции опережают защиту, падает даже Ферзь.',
      master: 'Ферзь пал.',
      alien: 'Ферзя похитили НЛО! 🛸',
      def: 'Ферзь взят!',
    },
    checkGiven: {
      mittens: 'Шах... Тишина перед бурей учит большему, чем тысячи слов.',
      alien: 'Шах из космоса! 🛸',
      def: 'Шах!',
    },
    botChecked: {
      knight: 'Хороший шах!',
      gotham: 'Шах, да? Посмотрим!',
      mittens: 'Мяу... Мягкое напоминание. Мудрый Король не боится давления.',
      def: 'Шах...',
    },
    checkmateWin: {
      mittens: 'Мат. Мяу... Победа принадлежит тому, кто видит гармонию доски ещё до прикосновения к фигуре.',
      gotham: 'МАТ! GG! Открой разбор партии!',
      alien: 'Космический мат! Вечеринка во вселенной! 🛸',
      master: 'Мат. Партия окончена.',
      def: 'Мат! GG.',
    },
    checkmateLoss: {
      dummy: 'Отличный мат! Супер тренировка!',
      gotham: 'GG! Ты меня поймал! Отличная партия!',
      mittens: 'Мяу... Отличная игра, мудрый путник. Сегодня твой взгляд был глубже моего.',
      master: 'Хорошая игра. Заслуженная победа.',
      alien: 'Ты победил! Безумнее самой вселенной! GG 🛸',
      def: 'GG! Хорошая игра.',
    },
    alienGambit: 'ALIEN GAMBIT!! Кxf7 прямо из космоса!! 🛸🔥',
    drawAcceptBot: 'Хорошо, ничья принята! Хорошая партия.',
    drawDeclineBot: 'Продолжаем игру, на доске ещё много борьбы.',
    useDrawBtn: 'Используй кнопку Ничья.',
    blunderReply: {
      gotham: 'Бывает даже у гроссмейстеров! Смотри разбор!',
      mittens: 'Мяу... Каждый мастер несёт мудрость тысячи ошибок. Учись без страха.',
      pos: 'Бывает!',
      neg: 'Со всеми случается.',
    },
    ggReply: {
      gotham: 'GG! Отличная битва!',
      mittens: 'Мяу... Честь остаётся на доске даже после последнего хода.',
      master: 'GG.',
      king: 'GG, славная игра!',
      def: 'Спасибо! GG!',
    },
    helloReply: {
      gothamchess: 'Привет! Готов пожертвовать THE ROOOOK?',
      mittens: 'Мяу... Приветствую, искатель истины. Пусть каждый ход несёт смысл.',
      alien: `${ALIEN_INTRO}`,
      dummy: 'Привет! Тренируйся свободно за обе стороны.',
      master: 'Сосредоточься на доске.',
      king: 'Привет! Мои дети болеют за меня сегодня!',
      bishop: 'Привет! Удачной игры!',
      knight: 'Привет! Не потеряй серию сегодня!',
    },
    shortLines: {
      dummy: ['Контролируй центр!', 'Ищи вилки и связки!', 'Сделай рокировку!'],
      alien: ['Космическая энергия! 🛸', 'Следи за полем f7!', 'Космическая вечеринка!', 'Твой ход, землянин!'],
      gothamchess: ['THE ROOOOK!', 'Следи за угрозами!', 'Развивай фигуры!', 'Интересно!'],
      mittens: [
        'Мяу... Спешка рождает иллюзии; глубина рождает мастерство.',
        'Каждый ход пешкой меняет судьбу эндшпиля.',
        'Истинный мастер побеждает в мыслях ещё до хода.',
        'Наблюдай за слабыми полями—там скрыта правда позиции.',
      ],
      master: ['Надёжный ход.', 'Считай глубже.', 'Каждая слабость важна.', 'Твой ход.'],
      knight: ['Держи серию!', 'Отличная практика!', 'Твой ход!', 'Так держать!'],
      bishop: ['Хм, интересно.', 'Посмотрим дальше.', 'Хороший темп.', 'Открытая игра.'],
      king: ['Хороший ход!', 'Считай точно.', 'Нравится эта позиция.', 'Вперёд!'],
    },
  },

  zh: {
    greetings: {
      knight: (u) => `你好 ${u}！准备好守护你的 Duolingo 连胜了吗？祝对局愉快！`,
      bishop: (u) => `你好 ${u}，祝你在月光下下出一盘好棋！`,
      king: (u) => `嘿 ${u}！我是马丁，来下一盘精彩的对局吧！`,
      master: (u) => `${u}。拿出你最强的棋艺。`,
      dummy: (u) => `自由训练已开启，${u}！可自由走动双方棋子并查看复盘。`,
      alien: (u) => `${ALIEN_INTRO} 欢迎来到轨道，${u}！`,
      gothamchess: (u) => `嘿 ${u}！准备好献祭 THE ROOOOK 了吗？`,
      mittens: (u) => `喵，${u}……耐心能看见急躁所忽略的一切。让我们在这六十四格中寻找真理。`,
    },
    blunder: {
      knight: '哎呀！你掉了一颗心 (??)',
      bishop: '哎呀，大漏着 (??)。',
      king: '注意棋子安全！漏着 (??)。',
      master: '决定性失误。',
      dummy: '小心！快看看复盘建议。',
      alien: '检测到宇宙异常！！🛸',
      gothamchess: '天呐！你在干嘛？！快看复盘！',
      mittens: '喵……一时大意会瓦解长久的布局。静下心来反思吧。',
    },
    brilliant: {
      knight: '100 XP 的妙手！！',
      bishop: '妙手 (!!)',
      king: '精准弃子 (!!)。',
      master: '非凡的一步。',
      dummy: '太精彩了！！',
      alien: '星际级计算！！太疯狂了！',
      gothamchess: '全部献祭！！神之一手！！',
      mittens: '喵……就连年迈的智者之猫，也会为清醒的弃子致敬。',
    },
    great: {
      knight: '好棋！',
      bishop: '唯一正解 (!)',
      king: '精确 (!)。',
      master: '精准。',
      dummy: '漂亮的发现！',
      alien: '轨道级精准！',
      gothamchess: '唯一解！太美了！',
      mittens: '喵……在急流中找到唯一稳固磐石的人，才是智者。',
    },
    captureQueen: {
      gotham: '吃掉皇后了！',
      mittens: '喵……当野心超越防守，连皇后也会陨落。',
      master: '皇后阵亡。',
      alien: '皇后被飞碟绑架了！🛸',
      def: '吃掉皇后！',
    },
    checkGiven: {
      mittens: '将军……暴风雨前的宁静胜过千言万语。',
      alien: '来自外太空的将军！🛸',
      def: '将军！',
    },
    botChecked: {
      knight: '漂亮的将军！',
      gotham: '将军？让我看看！',
      mittens: '喵……温和的提醒。智者之王不惧压力。',
      def: '将军……',
    },
    checkmateWin: {
      mittens: '将死。喵……胜利属于落子前便洞悉棋盘和谐的人。',
      gotham: '将死！GG！快打开复盘！',
      alien: '宇宙级将杀！太空派对开始！🛸',
      master: '将死。对局结束。',
      def: '将死！GG。',
    },
    checkmateLoss: {
      dummy: '漂亮的将杀！很棒的练习！',
      gotham: 'GG！被你算计了！好棋！',
      mittens: '喵……下得好，睿智的旅人。今天你的视野超越了我。',
      master: '下得好，你配得上这场胜利。',
      alien: '你赢了我！你比宇宙还疯狂！GG 🛸',
      def: 'GG！下得好。',
    },
    alienGambit: 'ALIEN GAMBIT!! 来自宇宙的 Nxf7 弃马杀招！！🛸🔥',
    drawAcceptBot: '好的，接受和棋！精彩的对局。',
    drawDeclineBot: '继续吧，棋盘上还有很多变化。',
    useDrawBtn: '请使用提和按钮。',
    blunderReply: {
      gotham: '特级大师也会失误！去看看复盘吧！',
      mittens: '喵……每位大师都背负着千次失误的智慧。不要害怕，从中学习。',
      pos: '难免的！',
      neg: '人人都会犯错。',
    },
    ggReply: {
      gotham: 'GG！精彩的对决！',
      mittens: '喵……最后一手之后，荣耀依然留在棋盘上。',
      master: 'GG。',
      king: 'GG，很棒的对局！',
      def: '谢谢！GG！',
    },
    helloReply: {
      gothamchess: '你好！准备好献祭 THE ROOOOK 了吗？',
      mittens: '喵……你好，真理的追寻者。愿每一步棋皆有深意。',
      alien: `${ALIEN_INTRO}`,
      dummy: '你好！自由操作双方练习吧！',
      master: '专注于棋盘。',
      king: '你好！今天孩子们都在为我加油！',
      bishop: '你好！祝对局愉快！',
      knight: '你好！别断了今天的连胜！',
    },
    shortLines: {
      dummy: ['尝试控制中心格 e4、d4、e5、d5！', '寻找捉双和牵制！', '记得尽早王车易位！'],
      alien: ['棋盘上充满宇宙能量！🛸', '小心 f7……外星人最爱猛攻！', '六十四格的宇宙派对！', '轮到你了，地球人！'],
      gothamchess: ['THE ROOOOK!', '注意对手的威胁！', '出动所有棋子！', '有意思！'],
      mittens: [
        '喵……急躁滋生幻觉，深思造就大师。',
        '每一步兵的前进都在改写残局的命运。',
        '真正的大师在落子前已在心中获胜。',
        '观察弱格——局面的真相就藏在那里。',
      ],
      master: ['稳健的一步。', '算得更深些。', '每个弱点都很致命。', '轮到你了。'],
      knight: ['保持连胜！', '很棒的练习！', '到你了！', '继续加油！'],
      bishop: ['嗯，有意思。', '看看后续变化。', '节奏不错。', '开放局面。'],
      king: ['好棋！', '仔细计算。', '我喜欢这个局面。', '到你了！'],
    },
  },

  ja: {
    greetings: {
      knight: (u) => `こんにちは ${u}！Duolingo の連続記録を守ろう！良い対局を！`,
      bishop: (u) => `こんにちは ${u}、月の下で良い対局を！`,
      king: (u) => `やあ ${u}！マーティンだよ、楽しい対局にしよう！`,
      master: (u) => `${u}。最高のチェスを見せてみろ。`,
      dummy: (u) => `ダミー練習モード開始、${u}！両方の駒を自由に動かせます。`,
      alien: (u) => `${ALIEN_INTRO} 軌道へようこそ、${u}！`,
      gothamchess: (u) => `やあ ${u}！THE ROOOOK を生贄にする準備はいいか？`,
      mittens: (u) => `ニャア、${u}……忍耐は焦りが見落とす真実を見る。六十四のマスに宿る理を辿ろう。`,
    },
    blunder: {
      knight: 'おっと！ハートを1つ失った (??)',
      bishop: '痛い、大悪手だ (??)。',
      king: '駒の安全に注意！悪手 (??)。',
      master: '決定的なミスだ。',
      dummy: '注意！レビューで最善手を確認しよう。',
      alien: '宇宙的異常を検知！！🛸',
      gothamchess: '嘘だろ！？何をやってるんだ！レビューを見よう！',
      mittens: 'ニャア……不注意な一歩が積み重ねた山を崩す。静かに振り返るのだ。',
    },
    brilliant: {
      knight: '100 XP の妙手！！',
      bishop: '妙手 (!!)',
      king: '正確なサクリファイス (!!)。',
      master: '見事な一手。',
      dummy: '素晴らしい手だ！！',
      alien: '銀河級の読み！！クレイジーだ！',
      gothamchess: '全部サクリファイスだ！！神の一手！！',
      mittens: 'ニャア……老いた賢猫でさえ、澄んだ心から生まれた犠牲には敬意を払う。',
    },
    great: {
      knight: 'ナイスムーブ！',
      bishop: '唯一の手 (!)',
      king: '正確 (!)。',
      master: '的確だ。',
      dummy: '良い発見！',
      alien: '軌道レベルの精度！',
      gothamchess: '唯一手！美しい！',
      mittens: 'ニャア……激流の中に唯一の確かな石を見出す者こそ賢者なり。',
    },
    captureQueen: {
      gotham: 'クイーンを奪った！',
      mittens: 'ニャア……野心が守りを追い越すとき、クイーンさえ落ちる。',
      master: 'クイーンが落ちた。',
      alien: 'クイーンがUFOにさらわれた！🛸',
      def: 'クイーンを取った！',
    },
    checkGiven: {
      mittens: 'チェック……嵐の前の静けさは千の言葉よりも多くを語る。',
      alien: '宇宙からのチェック！🛸',
      def: 'チェック！',
    },
    botChecked: {
      knight: 'いいチェック！',
      gotham: 'チェックだと？見てみよう！',
      mittens: 'ニャア……静かな警告。賢王は圧力を恐れない。',
      def: 'チェック……',
    },
    checkmateWin: {
      mittens: 'チェックメイト。ニャア……勝利は駒に触れる前に盤の調和を見抜く者に微笑む。',
      gotham: 'チェックメイト！GG！レビューを開こう！',
      alien: 'コズミック・チェックメイト！宇宙パーティーだ！🛸',
      master: 'チェックメイト。終局だ。',
      def: 'チェックメイト！GG。',
    },
    checkmateLoss: {
      dummy: '見事なメイト！良い練習だ！',
      gotham: 'GG！やられた！ナイスゲーム！',
      mittens: 'ニャア……見事だ、賢き旅人よ。今日のそなたの眼は私を超えた。',
      master: '見事な勝利だ。',
      alien: 'やられた！宇宙よりクレイジーだ！GG 🛸',
      def: 'GG！ナイスゲーム。',
    },
    alienGambit: 'ALIEN GAMBIT!! 宇宙からの Nxf7 突撃！！🛸🔥',
    drawAcceptBot: 'いいだろう、ドローを受け入れる。良い対局だった。',
    drawDeclineBot: '続けよう。盤上にはまだ多くのドラマが残っている。',
    useDrawBtn: 'ドローボタンを使ってください。',
    blunderReply: {
      gotham: 'GMでもやらかすさ！レビューを見よう！',
      mittens: 'ニャア……すべての達人は千の過ちから知恵を得る。恐れず学べ。',
      pos: 'そういうこともある！',
      neg: '誰にでもあることだ。',
    },
    ggReply: {
      gotham: 'GG！熱い戦いだった！',
      mittens: 'ニャア……最後の一手の後も、誇りは盤上に残る。',
      master: 'GG。',
      king: 'GG、楽しかった！',
      def: 'ありがとう！GG！',
    },
    helloReply: {
      gothamchess: 'やあ！THE ROOOOK を生贄にする準備はいい？',
      mittens: 'ニャア……真理の探究者よ、すべての手に意味を込めよ。',
      alien: `${ALIEN_INTRO}`,
      dummy: 'やあ！両側を自由に動かして練習しよう！',
      master: '盤面に集中せよ。',
      king: 'やあ！今日は子どもたちが応援してるんだ！',
      bishop: 'こんにちは！よろしくお願いします！',
      knight: 'やあ！今日も連続記録を伸ばそう！',
    },
    shortLines: {
      dummy: ['中央の e4, d4, e5, d5 を制しよう！', 'フォークやピンを探そう！', '早めにキャスリングしよう！'],
      alien: ['宇宙エネルギー全開！🛸', 'f7 に気をつけろ！', '64マスのスペースパーティー！', '君の番だ、地球人！'],
      gothamchess: ['THE ROOOOK!', '相手の狙いをチェック！', '駒を展開しよう！', '面白い！'],
      mittens: [
        'ニャア……焦りは幻想を生み、深さは熟達を生む。',
        'ポーンの一歩が遠い終盤の運命を決める。',
        '真の達人は駒を動かす前に頭の中で勝利している。',
        '弱いマスを見つめよ。そこに局面の真実が潜む。',
      ],
      master: ['堅実な手だ。', 'もっと深く読め。', 'すべての弱点が命取りになる。', '君の番だ。'],
      knight: ['記録を続けよう！', 'いい練習だ！', '君の番！', 'その調子！'],
      bishop: ['ふむ、興味深い。', '次を見てみよう。', 'いいテンポだ。', 'オープンな展開だね。'],
      king: ['ナイス！', 'よく読もう。', 'この局面は好きだな。', 'さあどうぞ！'],
    },
  },

  ko: {
    greetings: {
      knight: (u) => `안녕 ${u}! Duolingo 연속 기록을 지킬 준비 됐나요? 즐거운 대국 되세요!`,
      bishop: (u) => `안녕 ${u}, 달빛 아래 좋은 대국 하세요!`,
      king: (u) => `안녕 ${u}! 난 마틴이야, 재밌게 두자!`,
      master: (u) => `${u}. 최고의 체스를 보여줘.`,
      dummy: (u) => `더미 훈련 모드, ${u}! 양쪽 기물을 자유롭게 움직이고 복기를 확인하세요.`,
      alien: (u) => `${ALIEN_INTRO} 궤도에 오신 걸 환영해, ${u}!`,
      gothamchess: (u) => `안녕 ${u}! THE ROOOOK 희생할 준비 됐어?`,
      mittens: (u) => `야옹, ${u}... 인내는 성급함이 놓치는 것을 본다. 64칸 위에서 진리를 찾아보자.`,
    },
    blunder: {
      knight: '앗! 하트를 잃었어요 (??)',
      bishop: '아이고, 치명적 실수 (??).',
      king: '기물 안전을 조심해! 실수 (??).',
      master: '결정적 실수다.',
      dummy: '조심하세요! 복기에서 최선 수를 확인해보세요.',
      alien: '우주적 이상 현상 감지!! 🛸',
      gothamchess: '오 안돼! 지금 뭐 하는 거야?! 복기 확인해!',
      mittens: '야옹... 부주의한 한 걸음이 인내의 산을 무너뜨린다. 조용히 되돌아보거라.',
    },
    brilliant: {
      knight: '100 XP 짜리 묘수!!',
      bishop: '탁월한 수 (!!)',
      king: '정확한 희생 (!!).',
      master: '놀라운 수군.',
      dummy: '환상적인 수!!',
      alien: '은하계급 계산!! 완전 미쳤어!',
      gothamchess: '전부 희생해!! 엄청난 수야!!',
      mittens: '야옹... 늙고 지혜로운 고양이조차 명징한 마음에서 나온 희생 앞엔 고개를 숙인다.',
    },
    great: {
      knight: '훌륭한 수!',
      bishop: '유일한 수 (!)',
      king: '정확해 (!).',
      master: '정확하다.',
      dummy: '멋진 발견!',
      alien: '궤도 정밀도!',
      gothamchess: '유일한 수! 아름다워!',
      mittens: '야옹... 거센 강물 한가운데서 유일한 디딤돌을 찾는 자가 현명한 법.',
    },
    captureQueen: {
      gotham: '퀸을 잡았다!',
      mittens: '야옹... 야망이 수비를 앞지를 때, 퀸조차 무너진다.',
      master: '퀸이 잡혔다.',
      alien: '퀸이 UFO에 납치됨! 🛸',
      def: '퀸을 잡았다!',
    },
    checkGiven: {
      mittens: '체크... 폭풍 전의 고요는 천 마디 말보다 많은 것을 가르쳐 준다.',
      alien: '우주에서 온 체크! 🛸',
      def: '체크!',
    },
    botChecked: {
      knight: '좋은 체크!',
      gotham: '체크라고? 어디 보자!',
      mittens: '야옹... 부드러운 경고. 현명한 왕은 압박을 두려워하지 않는다.',
      def: '체크...',
    },
    checkmateWin: {
      mittens: '체크메이트. 야옹... 승리는 기물을 만지기 전에 판의 조화를 읽는 자의 것이다.',
      gotham: '체크메이트! GG! 복기를 열어봐!',
      alien: '우주 체크메이트! 우주 파티 시작! 🛸',
      master: '체크메이트. 대국 종료.',
      def: '체크메이트! GG.',
    },
    checkmateLoss: {
      dummy: '멋진 체크메이트! 훌륭한 훈련이었어요!',
      gotham: 'GG! 당했네! 좋은 경기!',
      mittens: '야옹... 훌륭하다, 지혜로운 여행자여. 오늘은 네 시야가 나를 넘어섰다.',
      master: '잘 뒀다. 승리를 거머쥐었군.',
      alien: '네가 이겼어! 우주보다 더 대단해! GG 🛸',
      def: 'GG! 잘 뒀어.',
    },
    alienGambit: 'ALIEN GAMBIT!! 우주에서 날아온 Nxf7!! 🛸🔥',
    drawAcceptBot: '좋아요, 무승부 수락! 좋은 대국이었어요.',
    drawDeclineBot: '계속 두죠, 아직 판 위에 할 일이 많아요.',
    useDrawBtn: '무승부 버튼을 사용하세요.',
    blunderReply: {
      gotham: 'GM도 실수해! 복기를 확인해!',
      mittens: '야옹... 모든 대가는 천 번의 실수에서 얻은 지혜를 품고 있다.',
      pos: '그럴 수 있죠!',
      neg: '누구나 실수해요.',
    },
    ggReply: {
      gotham: 'GG! 멋진 승부!',
      mittens: '야옹... 마지막 수 이후에도 명예는 보드 위에 남는다.',
      master: 'GG.',
      king: 'GG, 재밌는 대국!',
      def: '고마워요! GG!',
    },
    helloReply: {
      gothamchess: '안녕! THE ROOOOK 희생할 준비 됐어?',
      mittens: '야옹... 진리의 탐구자여, 모든 수에 뜻을 담거라.',
      alien: `${ALIEN_INTRO}`,
      dummy: '안녕! 양쪽을 직접 두며 자유롭게 연습하세요!',
      master: '보드에 집중해.',
      king: '안녕! 오늘 우리 아이들이 응원하고 있어!',
      bishop: '안녕하세요! 좋은 대국 되세요!',
      knight: '안녕! 오늘도 연속 기록 지켜요!',
    },
    shortLines: {
      dummy: ['중앙 e4, d4, e5, d5를 장악해 보세요!', '포크와 핀을 찾아보세요!', '일찍 캐슬링하세요!'],
      alien: ['우주 에너지 폭발! 🛸', 'f7을 조심해!', '64칸의 우주 파티!', '네 차례야, 지구인!'],
      gothamchess: ['THE ROOOOK!', '위협을 확인해!', '기물을 전개해!', '흥미롭네!'],
      mittens: [
        '야옹... 조급함은 환상을 낳고, 깊이는 숙달을 낳는다.',
        '폰의 전진 하나하나가 엔드게임의 운명을 바꾼다.',
        '진정한 대가는 기물을 들기 전에 머릿속에서 이미 승리한다.',
        '약한 칸을 주시하라—그곳에 국면의 진실이 숨어 있다.',
      ],
      master: ['단단한 수군.', '더 깊이 수읽기해.', '모든 약점이 치명적이다.', '네 차례다.'],
      knight: ['연속 기록 유지!', '좋은 연습!', '네 차례!', '계속 잘하고 있어!'],
      bishop: ['흠, 흥미롭군.', '다음 수를 보자.', '좋은 흐름이야.', '열린 판이네.'],
      king: ['좋은 수!', '잘 계산해 봐.', '이 포지션 마음에 들어.', '가자!'],
    },
  },

  ar: {
    greetings: {
      knight: (u) => `أهلاً ${u}! هل أنت مستعد للحفاظ على سلسلتك في Duolingo؟ بالتوفيق!`,
      bishop: (u) => `مرحباً ${u}، أتمنى لك مباراة ممتعة تحت ضوء القمر!`,
      king: (u) => `أهلاً ${u}! أنا مارتن، لنلعب مباراة رائعة!`,
      master: (u) => `${u}. أرِني أفضل ما لديك في الشطرنج.`,
      dummy: (u) => `وضع التدريب نشط، ${u}! حرّك كلا الجانبين بحرية وراجع نقلاتك.`,
      alien: (u) => `${ALIEN_INTRO} مرحباً بك في المدار، ${u}!`,
      gothamchess: (u) => `أهلاً ${u}! مستعد للتضحية بـ THE ROOOOK؟`,
      mittens: (u) =>
        `مياو، ${u}... الصبر يرى ما تغفل عنه العجلة. لنبحث عن الحقيقة فوق هذه الرقعة.`,
    },
    blunder: {
      knight: 'أوبس! فقدت قلباً (??)',
      bishop: 'آه، خطأ فادح (??).',
      king: 'انتبه لحماية قطعك! خطأ فادح (??).',
      master: 'خطأ حاسم.',
      dummy: 'انتبه! راجع أفضل نقلة في التحليل.',
      alien: 'تم رصد خلل كوني!! 🛸',
      gothamchess: 'يا إلهي! ماذا تفعل؟! افتح المراجعة!',
      mittens: 'مياو... خطوة متسرعة واحدة تهدم جبلاً من الصبر. تأمل بهدوء.',
    },
    brilliant: {
      knight: 'نقلة بـ 100 XP!!',
      bishop: 'عبقرية (!!)',
      king: 'تضحية دقيقة (!!).',
      master: 'نقلة لافتة.',
      dummy: 'نقلة رائعة!!',
      alien: 'حساب مجرّي!! جنون خالص!',
      gothamchess: 'ضحِّ بكل شيء!! يا لها من نقلة!!',
      mittens: 'مياو... حتى القط الحكيم ينحني أمام تضحية ولدت من صفاء الذهن.',
    },
    great: {
      knight: 'نقلة رائعة!',
      bishop: 'النقلة الوحيدة (!)',
      king: 'دقيقة (!).',
      master: 'دقيق.',
      dummy: 'اكتشاف رائع!',
      alien: 'دقة مدارية!',
      gothamchess: 'النقلة الوحيدة! جميلة!',
      mittens: 'مياو... الحكيم من يجد الحجر الثابت الوحيد وسط النهر الهائج.',
    },
    captureQueen: {
      gotham: 'تم أسر الوزير!',
      mittens: 'مياو... حين يسبق الطموحُ الدفاعَ، يسقط حتى الوزير.',
      master: 'سقط الوزير.',
      alien: 'تم اختطاف الوزير بصحن طائر! 🛸',
      def: 'تم أخذ الوزير!',
    },
    checkGiven: {
      mittens: 'كش... الصمت قبل العاصفة يعلّم أكثر من ألف كلمة.',
      alien: 'كش من الفضاء الخارجي! 🛸',
      def: 'كش!',
    },
    botChecked: {
      knight: 'كش جميل!',
      gotham: 'كش ها؟ لنرَ!',
      mittens: 'مياو... تذكير لطيف. الملك الحكيم لا يخشى الضغط.',
      def: 'كش...',
    },
    checkmateWin: {
      mittens: 'كش مات. مياو... النصر لمن يدرك تناغم الرقعة قبل أن يلمس قطعة.',
      gotham: 'كش مات! GG! افتح المراجعة!',
      alien: 'كش مات كوني! حفلة فضائية! 🛸',
      master: 'كش مات. انتهت المباراة.',
      def: 'كش مات! GG.',
    },
    checkmateLoss: {
      dummy: 'كش مات رائع! تدريب ممتاز!',
      gotham: 'GG! أوقعتني في الفخ! مباراة رائعة!',
      mittens: 'مياو... أحسنت اللعب أيها المسافر الحكيم. اليوم فاقت رؤيتك رؤيتي.',
      master: 'أحسنت اللعب. استحققت الفوز.',
      alien: 'لقد هزمتني! أنت أجنّ من الكون! GG 🛸',
      def: 'GG! أحسنت اللعب.',
    },
    alienGambit: 'ALIEN GAMBIT!! تضحية Nxf7 مباشرة من الفضاء!! 🛸🔥',
    drawAcceptBot: 'حسناً، تم قبول التعادل! مباراة جميلة.',
    drawDeclineBot: 'لنواصل اللعب، لا يزال هناك الكثير على الرقعة.',
    useDrawBtn: 'استخدم زر التعادل.',
    blunderReply: {
      gotham: 'يحدث حتى لكبار الأساتذة! راجع التحليل!',
      mittens: 'مياو... كل أستاذ يحمل حكمة ألف خطأ. تعلم منها بلا خوف.',
      pos: 'يحدث ذلك!',
      neg: 'يحدث للجميع.',
    },
    ggReply: {
      gotham: 'GG! معركة رائعة!',
      mittens: 'مياو... يبقى الشرف على الرقعة حتى بعد النقلة الأخيرة.',
      master: 'GG.',
      king: 'GG، تحدٍ جميل!',
      def: 'شكراً! GG!',
    },
    helloReply: {
      gothamchess: 'أهلاً! مستعد للتضحية بـ THE ROOOOK؟',
      mittens: 'مياو... تحية لباحث الحقيقة. ليكن لكل نقلة هدف.',
      alien: `${ALIEN_INTRO}`,
      dummy: 'أهلاً! تدرب بحرية بتحريك الجانبين.',
      master: 'ركز على الرقعة.',
      king: 'أهلاً! أطفالي يشجعونني اليوم!',
      bishop: 'مرحباً! مباراة ممتعة!',
      knight: 'أهلاً! لا تفقد سلسلتك اليوم!',
    },
    shortLines: {
      dummy: ['سيطر على الوسط e4, d4, e5, d5!', 'ابحث عن الشوكات والتثبيت!', 'تذكر التبييت مبكراً!'],
      alien: ['طاقة كونية على الرقعة! 🛸', 'احذر من المربع f7!', 'حفلة فضائية على 64 مربعاً!', 'دورك يا ابن الأرض!'],
      gothamchess: ['THE ROOOOK!', 'راقب التهديدات!', 'انشر قطعك!', 'مثير للاهتمام!'],
      mittens: [
        'مياو... العجلة تصنع الأوهام، والعمق يصنع الإتقان.',
        'كل دفعة بيدق تعيد تشكيل مصير النهاية.',
        'الأستاذ الحقيقي ينتصر في ذهنه قبل أن يحرك قطعة.',
        'راقب المربعات الضعيفة—هناك تختبئ حقيقة الموقف.',
      ],
      master: ['نقلة متينة.', 'احسب بعمق أكبر.', 'كل نقطة ضعف مهمة.', 'دورك.'],
      knight: ['حافظ على السلسلة!', 'تدريب رائع!', 'دورك!', 'استمر هكذا!'],
      bishop: ['همم، مثير للاهتمام.', 'لنرَ التكملة.', 'إيقاع جيد.', 'لعب مفتوح.'],
      king: ['نقلة جميلة!', 'احسب جيداً.', 'أحب هذا الوضع.', 'تفضل!'],
    },
  },
};

export function getLocalizedBotGreeting(
  botId: BotId,
  opponentUsername: string,
  lang?: string
): string {
  const pack = PACKS[normLang(lang)];
  return pack.greetings[botId](opponentUsername);
}

export function getLocalizedBotQualityReaction(
  botId: BotId,
  quality: MoveQuality,
  lang?: string
): string | null {
  const pack = PACKS[normLang(lang)];
  if (quality === 'blunder') return pack.blunder[botId];
  if (quality === 'brilliant') return pack.brilliant[botId];
  if (quality === 'great') return pack.great[botId];
  return null;
}

export function getLocalizedBotMoveComment(
  botId: BotId,
  event: BotMoveEvent,
  lang?: string
): string | null {
  const pack = PACKS[normLang(lang)];
  if (event === 'alien_gambit') return pack.alienGambit;
  if (event === 'capture_queen') {
    if (botId === 'gothamchess') return pack.captureQueen.gotham;
    if (botId === 'mittens') return pack.captureQueen.mittens;
    if (botId === 'master') return pack.captureQueen.master;
    if (botId === 'alien') return pack.captureQueen.alien;
    return pack.captureQueen.def;
  }
  if (event === 'check_given') {
    if (botId === 'mittens') return pack.checkGiven.mittens;
    if (botId === 'alien') return pack.checkGiven.alien;
    return pack.checkGiven.def;
  }
  if (event === 'bot_checked') {
    if (botId === 'knight') return pack.botChecked.knight;
    if (botId === 'gothamchess') return pack.botChecked.gotham;
    if (botId === 'mittens') return pack.botChecked.mittens;
    return pack.botChecked.def;
  }
  if (event === 'checkmate_win') {
    if (botId === 'mittens') return pack.checkmateWin.mittens;
    if (botId === 'gothamchess') return pack.checkmateWin.gotham;
    if (botId === 'alien') return pack.checkmateWin.alien;
    if (botId === 'master') return pack.checkmateWin.master;
    return pack.checkmateWin.def;
  }
  if (event === 'checkmate_loss') {
    if (botId === 'dummy') return pack.checkmateLoss.dummy;
    if (botId === 'gothamchess') return pack.checkmateLoss.gotham;
    if (botId === 'mittens') return pack.checkmateLoss.mittens;
    if (botId === 'master') return pack.checkmateLoss.master;
    if (botId === 'alien') return pack.checkmateLoss.alien;
    return pack.checkmateLoss.def;
  }
  return null;
}

export function getLocalizedBotDrawReply(accept: boolean, lang?: string): string {
  const pack = PACKS[normLang(lang)];
  return accept ? pack.drawAcceptBot : pack.drawDeclineBot;
}

export function getLocalizedBotChatReply(
  botId: BotId,
  playerText: string,
  matBalance: number,
  _botColor: PieceColor,
  movesCount: number,
  lang?: string
): string {
  const pack = PACKS[normLang(lang)];
  const lower = playerText.toLowerCase().trim();

  if (/ciao|salve|hey|ehi|buongiorno|buonasera|buona partita|gl|hf|hello|hi|hola|bonjour|hallo|olá|привет|你好|안녕|こんにちは|مرحبا/.test(lower)) {
    return pack.helloReply[botId];
  }

  if (/gg|bella|bravo|brava|forte|grazie|complimenti|thanks|nice|good game|bien|merci|danke|obrigado|спасибо|谢谢|ありがとう|고마워|شكرا/.test(lower)) {
    if (botId === 'gothamchess') return pack.ggReply.gotham;
    if (botId === 'mittens') return pack.ggReply.mittens;
    if (botId === 'master') return pack.ggReply.master;
    if (botId === 'king') return pack.ggReply.king;
    return pack.ggReply.def;
  }

  if (/patta|pareggio|draw|tablas|nulle|remis|empate|ничья|和棋|引き分け|무승부|تعادل/.test(lower)) {
    return pack.useDrawBtn;
  }

  if (/blunder|errore|noo|ops|cavolo|mistake|oops|error|gaffe|patzer/.test(lower)) {
    if (botId === 'gothamchess') return pack.blunderReply.gotham;
    if (botId === 'mittens') return pack.blunderReply.mittens;
    return matBalance > 150 ? pack.blunderReply.pos : pack.blunderReply.neg;
  }

  const pool = pack.shortLines[botId];
  return pool[(movesCount + lower.length) % pool.length];
}
