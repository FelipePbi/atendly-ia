import type { LegalDetails } from "@/config/legal-details";
import {
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_LAST_UPDATED_DATE,
  PRIVACY_POLICY_VERSION,
} from "@/config/legal-versions";
import type { LegalDocumentContent } from "./types";

export function createPrivacyPolicy(details: LegalDetails): LegalDocumentContent {
  return {
    title: "Política de Privacidade",
    intro:
      "Esta Política explica como dados pessoais são tratados no uso da Atendly e apresenta os direitos previstos na Lei Geral de Proteção de Dados Pessoais (LGPD).",
    version: PRIVACY_POLICY_VERSION,
    effectiveDate: PRIVACY_POLICY_EFFECTIVE_DATE,
    lastUpdatedDate: PRIVACY_POLICY_LAST_UPDATED_DATE,
    sections: [
      {
        id: "controlador",
        title: "1. Controlador e canal de privacidade",
        paragraphs: [
          `${details.legalName}, nome fantasia ${details.tradeName}, CNPJ ${details.cnpj}, endereço ${details.address}, atua como controladora dos dados de cadastro, conta e relacionamento direto com seus Usuários.`,
          `Canal de privacidade: ${details.privacyEmail}. Responsável ou encarregado: ${details.privacyOfficer}.`,
          "Para dados de Contatos inseridos pelo Cliente, os papéis de controlador e operador dependem da atividade concreta. Em geral, o Cliente define finalidades e meios essenciais do atendimento e a Atendly trata os dados segundo suas instruções, sem afastar responsabilidades próprias previstas em lei.",
        ],
      },
      {
        id: "escopo",
        title: "2. Escopo",
        paragraphs: [
          "Esta Política se aplica ao site, painel, cadastro, suporte, integrações e funcionalidades da Atendly. Serviços de Terceiros possuem políticas próprias, que devem ser consultadas pelo Usuário.",
        ],
      },
      {
        id: "dados-coletados",
        title: "3. Categorias de dados tratados",
        subsections: [
          {
            title: "Dados de cadastro, negócio e conta",
            bullets: [
              "E-mail, credenciais protegidas por hash, nome e dados de perfil.",
              "Nome do negócio, informações profissionais, endereço comercial, preferências e configurações.",
              "Dados de assinatura, plano e histórico administrativo, quando aplicável.",
            ],
          },
          {
            title: "WhatsApp, contatos e conversas",
            bullets: [
              "Identificadores e status da instância, número vinculado, QR ou código transitório e metadados de conexão.",
              "Identificadores de Contatos, nomes exibidos, mensagens, anexos, horários e histórico de conversa quando necessários ao serviço configurado pelo Cliente.",
            ],
          },
          {
            title: "Uso, dispositivo, logs e segurança",
            bullets: [
              "Eventos de uso, falhas, registros técnicos, data e hora, identificadores de sessão e informações necessárias para segurança, prevenção a fraude e diagnóstico.",
              "Cookies essenciais de sessão e, se habilitados separadamente, cookies opcionais de medição ou preferência.",
            ],
          },
        ],
      },
      {
        id: "finalidades",
        title: "4. Finalidades do tratamento",
        bullets: [
          "Criar, autenticar e administrar contas.",
          "Configurar o negócio, conectar canais e entregar atendimento automatizado e humano.",
          "Processar mensagens, contexto, agenda e integrações solicitadas pelo Cliente.",
          "Prestar suporte, responder solicitações e comunicar mudanças operacionais.",
          "Proteger contas, prevenir abuso, investigar incidentes e manter registros de auditoria.",
          "Cumprir obrigações legais, regulatórias e ordens válidas.",
          "Medir e melhorar desempenho e experiência com dados agregados ou minimizados quando possível.",
          "Enviar marketing somente quando houver base legal adequada e controle separado de oposição ou consentimento.",
        ],
      },
      {
        id: "bases-legais",
        title: "5. Bases legais",
        subsections: [
          {
            title: "Execução de contrato e procedimentos preliminares",
            paragraphs: [
              "Cadastro, autenticação, suporte contratado, conexão de canais, processamento de conversas e entrega das funcionalidades solicitadas pelo Usuário.",
            ],
          },
          {
            title: "Cumprimento de obrigação legal ou regulatória",
            paragraphs: [
              "Registros fiscais, atendimento de autoridades, exercício de direitos obrigatórios e guarda exigida pela legislação.",
            ],
          },
          {
            title: "Legítimo interesse",
            paragraphs: [
              "Segurança, prevenção a fraude, melhoria técnica e comunicações operacionais, após avaliação de necessidade, balanceamento e salvaguardas aos direitos dos titulares.",
            ],
          },
          {
            title: "Exercício regular de direitos",
            paragraphs: [
              "Conservação e uso de registros necessários em processos judiciais, administrativos ou arbitrais.",
            ],
          },
          {
            title: "Consentimento",
            paragraphs: [
              "Usado apenas quando apropriado, como marketing ou cookies opcionais. É livre, destacado, revogável e não condiciona a conta quando o tratamento não é necessário ao serviço.",
            ],
          },
        ],
      },
      {
        id: "ia",
        title: "6. Inteligência artificial e decisões automatizadas",
        paragraphs: [
          `Conteúdo e instruções podem ser enviados a ${details.aiProvider} para gerar respostas, classificar contexto ou acionar ferramentas configuradas. A Atendly aplica minimização e controles contratuais e técnicos compatíveis com a operação.`,
          "A Plataforma automatiza respostas e fluxos, mas não deve ser configurada para decisão exclusivamente automatizada que produza efeitos jurídicos ou significativamente afete pessoas sem avaliação, transparência e supervisão adequadas.",
          `Pedidos de informação ou revisão sobre tratamento automatizado podem ser enviados para ${details.privacyEmail}.`,
        ],
      },
      {
        id: "compartilhamento",
        title: "7. Fornecedores e operadores",
        paragraphs: [
          "Dados podem ser compartilhados com operadores estritamente necessários, sujeitos a contrato, confidencialidade, segurança e instruções compatíveis com esta Política.",
          "Não vendemos dados pessoais. Eventual reorganização societária observará finalidade, transparência e direitos aplicáveis.",
        ],
      },
      {
        id: "meta-whatsapp",
        title: "8. WhatsApp e Meta",
        paragraphs: [
          "A conexão ao WhatsApp envolve sistemas e regras da Meta e do provedor do canal. Metadados, mensagens e identificadores podem transitar por esses serviços conforme a configuração do Cliente e as políticas próprias desses terceiros.",
          "O Cliente deve informar seus Contatos sobre o tratamento realizado em seu atendimento e manter base legal adequada.",
        ],
      },
      {
        id: "provedores",
        title: "9. IA, hospedagem, analytics e suporte",
        bullets: [
          `Provedor de IA: ${details.aiProvider}.`,
          `Hospedagem e infraestrutura: ${details.hostingProvider}.`,
          `Analytics: ${details.analyticsProviders}.`,
          `Suporte e atendimento: canal ${details.supportEmail} e fornecedores que venham a operar esse canal.`,
        ],
      },
      {
        id: "transferencias-internacionais",
        title: "10. Transferências internacionais",
        paragraphs: [
          "Alguns fornecedores podem tratar dados fora do Brasil. Nesses casos, serão adotados mecanismos permitidos pela LGPD, avaliação do destino e salvaguardas contratuais e técnicas adequadas.",
          "Países, mecanismos e fornecedores concretos dependem da confirmação da infraestrutura indicada nesta Política.",
        ],
      },
      {
        id: "retencao",
        title: "11. Retenção, descarte e anonimização",
        paragraphs: [
          `Critério ou prazo geral pendente de confirmação: ${details.retentionPeriod}.`,
          "Dados são mantidos pelo tempo necessário às finalidades informadas, à execução contratual, a obrigações legais e ao exercício regular de direitos. Encerrada a necessidade, serão eliminados ou anonimizados, salvo conservação permitida ou exigida por lei.",
          "Prazos podem variar conforme categoria, instrução do Cliente, backup seguro, litígio ou obrigação aplicável.",
        ],
      },
      {
        id: "seguranca",
        title: "12. Segurança",
        paragraphs: [
          "Adotamos medidas administrativas e técnicas proporcionais ao risco, incluindo controle de acesso, proteção de credenciais, segregação de ambientes, registros de segurança, gestão de vulnerabilidades e resposta a incidentes.",
          "Nenhum sistema é infalível. Incidentes relevantes serão avaliados e comunicados aos titulares e à Autoridade Nacional de Proteção de Dados quando exigido pela LGPD.",
        ],
      },
      {
        id: "direitos",
        title: "13. Direitos dos titulares",
        bullets: [
          "Confirmação da existência de tratamento e acesso aos dados.",
          "Correção de dados incompletos, inexatos ou desatualizados.",
          "Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade.",
          "Portabilidade, observadas regulamentação, segredos comercial e industrial.",
          "Informação sobre compartilhamentos e sobre a possibilidade de não consentir, quando aplicável.",
          "Revogação do consentimento e eliminação dos dados tratados com essa base, ressalvadas hipóteses legais de conservação.",
          "Oposição a tratamento irregular e revisão de decisões exclusivamente automatizadas, nos termos da LGPD.",
          "Petição perante a Autoridade Nacional de Proteção de Dados.",
        ],
      },
      {
        id: "solicitacoes",
        title: "14. Como exercer seus direitos",
        paragraphs: [
          `Envie a solicitação para ${details.privacyEmail}, descrevendo o direito e o contexto. Poderemos pedir confirmação proporcional de identidade para impedir fraude, sem coletar dados excessivos.`,
          "Quando a Atendly atuar apenas como operadora de dados de um Contato, encaminharemos a solicitação ao Cliente controlador ou orientaremos o titular a procurá-lo. Respostas observarão prazos e exceções legais.",
        ],
      },
      {
        id: "cookies",
        title: "15. Cookies e tecnologias semelhantes",
        paragraphs: [
          "Cookies estritamente necessários sustentam autenticação, segurança e preferências essenciais. Eles não dependem de consentimento quando indispensáveis à funcionalidade solicitada.",
          "Cookies opcionais de analytics, publicidade ou personalização, se usados, terão controle separado, desmarcado por padrão quando exigido, e poderão ser revogados sem impedir o serviço essencial.",
        ],
      },
      {
        id: "criancas",
        title: "16. Crianças e adolescentes",
        paragraphs: [
          "A conta Atendly é destinada a pessoas capazes de contratar e não é dirigida a crianças. O Cliente não deve usar a Plataforma para tratar dados de crianças ou adolescentes sem avaliar o melhor interesse, a base legal e as salvaguardas específicas exigidas.",
          `Se identificar tratamento indevido, contate ${details.privacyEmail}.`,
        ],
      },
      {
        id: "alteracoes",
        title: "17. Alterações, versão e vigência",
        paragraphs: [
          "Mudanças relevantes serão identificadas por versão, data de vigência e última atualização. Avisos adicionais ou nova ciência serão solicitados quando exigidos pela natureza da mudança ou pela lei.",
        ],
      },
      {
        id: "contato",
        title: "18. Contato de privacidade",
        paragraphs: [
          `Responsável ou encarregado: ${details.privacyOfficer}. E-mail: ${details.privacyEmail}. Canal geral de suporte: ${details.supportEmail}.`,
        ],
      },
    ],
  };
}
