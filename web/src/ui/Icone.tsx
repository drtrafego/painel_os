// Icones escritos a mao. Nenhuma biblioteca: o dia que um pacote de icones
// muda, nao quebra uma tela que estava andando.

export type NomeIcone =
  | 'comando' | 'equipe' | 'tarefas' | 'agenda' | 'ferramentas'
  | 'pipeline' | 'analitica' | 'biblioteca' | 'cofre'
  | 'coroa' | 'bot' | 'lupa' | 'pincel' | 'codigo' | 'escudo'
  | 'radar' | 'texto' | 'megafone' | 'grafico' | 'seta' | 'chat' | 'menu'
  | 'recolher' | 'expandir' | 'tela-cheia' | 'tela-normal'

const TRACOS: Record<NomeIcone, React.ReactNode> = {
  comando: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  equipe: <><circle cx="12" cy="5" r="2.4" /><circle cx="5" cy="18" r="2.4" /><circle cx="19" cy="18" r="2.4" /><path d="M12 7.4v4.4M6.6 15.9 11 12.2M17.4 15.9 13 12.2" /></>,
  tarefas: <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M3.5 6l1.2 1.2L7 5" /><path d="M3.5 12l1.2 1.2L7 11" /><circle cx="4.6" cy="18" r="1.1" /></>,
  agenda: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  ferramentas: <><path d="M14.5 5.5a4 4 0 0 0 5 5L21 9v6l-6 6H9l-6-6 6-6h6l1.5-1.5z" /></>,
  pipeline: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" /></>,
  analitica: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  biblioteca: <><path d="M4 4h6v16H4zM14 4h6v16h-6z" /><path d="M4 9h6M14 9h6" /></>,
  cofre: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  coroa: <><path d="M4 17h16l1-9-5 3-4-6-4 6-5-3 1 9z" /><path d="M4 20h16" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 14h.01M15 14h.01" /><path d="M9.5 17.5h5" /></>,
  lupa: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.4-4.4" /></>,
  pincel: <><path d="M4 20c3 0 4-1.6 4-4a3 3 0 1 0-4 4z" /><path d="M8.5 15.5 19 5a2.1 2.1 0 0 0-3-3L5.5 12.5" /></>,
  codigo: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
  escudo: <><path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3z" /><path d="m9 12 2 2 4-4" /></>,
  radar: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><path d="M12 12 18 6" /></>,
  texto: <><path d="M5 6h14M5 12h14M5 18h9" /></>,
  megafone: <><path d="M4 10v4a1 1 0 0 0 1 1h2l7 4V5L7 9H5a1 1 0 0 0-1 1z" /><path d="M18 9.5a4 4 0 0 1 0 5" /></>,
  grafico: <><path d="M3 17l5.5-6 4 3.5L21 6" /><path d="M15 6h6v6" /></>,
  seta: <><path d="M5 12h13M13 6l6 6-6 6" /></>,
  chat: <><path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" /><path d="M8.5 10h7M8.5 13h4" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  recolher: <><path d="M15 18l-6-6 6-6" /></>,
  expandir: <><path d="M9 18l6-6-6-6" /></>,
  'tela-cheia': <><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></>,
  'tela-normal': <><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></>,
}

export function Icone({
  nome, tamanho = 16, className = '', strokeWidth = 1.5,
}: { nome: NomeIcone; tamanho?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" focusable="false"
    >
      {TRACOS[nome]}
    </svg>
  )
}
