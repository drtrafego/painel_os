import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import type { PropsTela } from './Vazias'

export function Redes({ estado, vista }: PropsTela) {
  const dados = estado.redes

  if (!dados || dados.status !== 'pronto') {
    const statusMsg = dados?.status === 'indeterminado' ? 'coleta em andamento ou cache expirado' : 'fonte indisponível'
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
        <TituloDaTela titulo="Redes Orgânicas." pergunta={vista.pergunta} />
        <div data-redes-ausente className="rounded-lg border border-ambar/30 bg-ambar/8 p-4">
          <div className="rotulo mb-2 !text-ambar">{statusMsg}</div>
          <p className="text-sm leading-relaxed text-tinta-2">
            Isto não é zero, é ausência de medição. A tela não transforma indisponibilidade do conector social em zero inventado.
          </p>
          <p className="mt-2 font-mono text-[10px] text-tinta-3">
            {dados?.erro ?? 'o coletor ainda não obteve os insights orgânicos do Instagram'}
          </p>
        </div>
      </div>
    )
  }

  const ig = dados.instagram

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
      <TituloDaTela
        titulo="Redes Orgânicas."
        pergunta="Desempenho de mídia orgânica da marca @gastaomatos (Instagram e LinkedIn)."
        direita={
          <span className="rotulo">
            medido em {new Date(dados.atualizado_em).toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'UTC' })} utc
          </span>
        }
      />

      {/* Resumo de 3 KPIs Principais no Topo */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Kpi
          rotulo="Seguidores @gastaomatos"
          valor={ig?.seguidores !== null && ig?.seguidores !== undefined ? ig.seguidores.toLocaleString('pt-BR') : '—'}
          cor="text-rosa"
        />
        <Kpi
          rotulo="Alcance Agregado"
          valor={ig?.alcance_agregado !== null && ig?.alcance_agregado !== undefined ? ig.alcance_agregado.toLocaleString('pt-BR') : '—'}
          cor="text-ciano"
        />
        <Kpi
          rotulo="Salvamentos Agregados"
          valor={ig?.salvamentos_agregado !== null && ig?.salvamentos_agregado !== undefined ? ig.salvamentos_agregado.toLocaleString('pt-BR') : '—'}
          cor="text-verde"
        />
      </div>

      {/* Detalhe do Instagram e do LinkedIn */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Conector Instagram */}
        <section className="carta p-4">
          <Cabecalho cor="var(--color-rosa)">Instagram @gastaomatos</Cabecalho>
          <div className="mt-2 text-xs leading-relaxed text-tinta-2">
            Conexão ativa via Composio Graph API (user_id: 26530904369921644).
          </div>
          <div className="mt-3">
            <div className="rotulo mb-1">Métricas obtidas</div>
            <div className="flex flex-wrap gap-1">
              {ig?.metricas_obtidas && ig.metricas_obtidas.length > 0 ? (
                ig.metricas_obtidas.map((m) => (
                  <Pilula key={m} tom="verde">
                    {m}
                  </Pilula>
                ))
              ) : (
                <span className="text-xs text-tinta-3">Nenhuma métrica lida</span>
              )}
            </div>
          </div>
        </section>

        {/* Conector LinkedIn */}
        <section className="carta p-4">
          <Cabecalho cor="var(--color-ciano)">LinkedIn Orgânico</Cabecalho>
          <div className="mt-2 text-xs leading-relaxed text-tinta-2">
            Status da permissão OAuth de leitura orgânica:
          </div>
          <div className="mt-3 rounded-md border border-linha bg-fundo p-3">
            <div className="flex items-center gap-2">
              <span className={`inline-block size-2 rounded-full ${dados.linkedin?.status === 'disponivel' ? 'bg-verde' : 'bg-ambar'}`} />
              <span className="font-bold text-tinta text-xs">
                {dados.linkedin?.status === 'disponivel' ? 'Leitura Ativa' : 'Sem permissão de leitura'}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-tinta-3">
              {dados.linkedin?.motivo ?? 'escopo r_organization_social_feed não confirmado nesta sessão'}
            </p>
          </div>
        </section>
      </div>

      <p className="mt-4 max-w-3xl text-[10.5px] leading-relaxed text-tinta-3">
        Fonte: Composio API v3.1 / Graph API Instagram & LinkedIn. O coletor lê apenas métricas públicas de desempenho e nunca repassa comentários ou dados de usuários.
      </p>
    </div>
  )
}
