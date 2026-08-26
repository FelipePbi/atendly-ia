import type { LegalDetails } from "@/config/legal-details";
import {
  TERMS_EFFECTIVE_DATE,
  TERMS_LAST_UPDATED_DATE,
  TERMS_VERSION,
} from "@/config/legal-versions";
import type { LegalDocumentContent } from "./types";

export function createTermsOfUse(details: LegalDetails): LegalDocumentContent {
  return {
    title: "Termos de Uso",
    intro:
      "Estes Termos apresentam as regras para criação da conta e uso da Atendly, plataforma de atendimento automatizado por inteligência artificial integrada ao WhatsApp.",
    version: TERMS_VERSION,
    effectiveDate: TERMS_EFFECTIVE_DATE,
    lastUpdatedDate: TERMS_LAST_UPDATED_DATE,
    sections: [
      {
        id: "identificacao",
        title: "1. Identificação da responsável",
        paragraphs: [
          `A Atendly é disponibilizada por ${details.legalName}, nome fantasia ${details.tradeName}, inscrita no CNPJ sob nº ${details.cnpj}, com endereço em ${details.address}.`,
        ],
      },
      {
        id: "definicoes",
        title: "2. Definições",
        bullets: [
          "Atendly ou Plataforma: solução tecnológica descrita nestes Termos.",
          "Usuário ou Cliente: pessoa que cria e administra uma conta para seu negócio.",
          "Contato: pessoa que se comunica com o Cliente por canais conectados à Plataforma.",
          "Conteúdo: mensagens, instruções, arquivos e demais informações processadas no uso do serviço.",
          "Serviços de Terceiros: WhatsApp/Meta, provedores de IA, hospedagem, agenda e outros sistemas integrados.",
        ],
      },
      {
        id: "servicos",
        title: "3. A Atendly e os serviços oferecidos",
        paragraphs: [
          "A Plataforma auxilia pequenos negócios a organizar conversas, configurar atendimento automatizado por IA, realizar transição para atendimento humano e, quando habilitado, consultar ou executar fluxos de agenda.",
          "Funcionalidades disponíveis podem variar por plano, estágio do produto, integrações contratadas e disponibilidade técnica dos Serviços de Terceiros.",
        ],
      },
      {
        id: "conta",
        title: "4. Criação e manutenção da conta",
        paragraphs: [
          "O Usuário deve fornecer dados verdadeiros, completos e atualizados, possuir capacidade para contratar e estar autorizado a representar o negócio informado.",
          "Uma conta não deve ser compartilhada de modo que impeça a identificação de seu responsável. Mudanças relevantes nos dados cadastrais devem ser atualizadas sem demora.",
        ],
      },
      {
        id: "credenciais",
        title: "5. Responsabilidades do Usuário e credenciais",
        paragraphs: [
          "O Usuário é responsável pela confidencialidade de suas credenciais, pelos dispositivos autorizados e pelas ações realizadas em sua conta, salvo falha comprovadamente atribuível à Atendly.",
          `Suspeitas de acesso indevido devem ser comunicadas imediatamente pelo canal ${details.supportEmail}.`,
        ],
      },
      {
        id: "whatsapp-terceiros",
        title: "6. WhatsApp e Serviços de Terceiros",
        paragraphs: [
          "O uso de WhatsApp, Meta e outras integrações está sujeito também aos contratos, políticas, limites e decisões desses terceiros. O Cliente deve manter contas e autorizações válidas e cumprir as regras aplicáveis ao canal.",
          "Mudanças, indisponibilidades, bloqueios ou restrições impostas por terceiros podem afetar funcionalidades sem controle direto da Atendly.",
        ],
      },
      {
        id: "inteligencia-artificial",
        title: "7. Limitações das respostas geradas por IA",
        paragraphs: [
          `A Plataforma pode usar modelos fornecidos por ${details.aiProvider}. Respostas de IA são probabilísticas: podem conter imprecisões, omissões, vieses ou conteúdo inadequado ao contexto.`,
          "A Atendly não substitui aconselhamento médico, jurídico, financeiro ou outro serviço profissional regulado. O Cliente não deve configurar a IA para decisões de alto impacto sem controles humanos adequados.",
        ],
      },
      {
        id: "revisao-do-cliente",
        title: "8. Revisão de configurações e respostas",
        paragraphs: [
          "O Cliente deve revisar identidade, instruções, integrações, disponibilidade de agenda, políticas comerciais e respostas automáticas antes e durante o uso, além de manter um canal de supervisão humana.",
          "O Cliente responde pelas informações de seu negócio e pelas decisões tomadas com base nas respostas geradas, observados os limites legais de responsabilidade da Atendly.",
        ],
      },
      {
        id: "uso-aceitavel",
        title: "9. Uso aceitável e condutas proibidas",
        bullets: [
          "Usar a Plataforma para fraude, assédio, discriminação, exploração ou atividade ilícita.",
          "Enviar spam, conteúdo malicioso ou comunicações sem base jurídica adequada.",
          "Tentar obter acesso não autorizado, explorar vulnerabilidades ou prejudicar a disponibilidade do serviço.",
          "Violar direitos de terceiros, propriedade intelectual, privacidade ou proteção de dados.",
          "Apresentar respostas automatizadas como humanas quando a transparência for exigida pela lei ou pelo contexto.",
        ],
      },
      {
        id: "contatos-mensagens",
        title: "10. Contatos, mensagens e bases de destinatários",
        paragraphs: [
          "O Cliente declara possuir base legal e, quando necessário, autorização para utilizar dados, contatos e listas de destinatários processados pela Plataforma.",
          "Cabe ao Cliente respeitar opt-out, preferências de comunicação, regras de publicidade, direitos dos titulares e restrições do WhatsApp/Meta.",
        ],
      },
      {
        id: "planos-cobrancas",
        title: "11. Planos, cobrança, renovação e cancelamento",
        paragraphs: [
          "Quando houver plano pago, preço, periodicidade, limites, tributos, renovação, teste, reajuste e condições de cancelamento serão apresentados antes da contratação ou em proposta específica.",
          "Nenhuma condição comercial não informada deve ser presumida a partir deste template. Direitos obrigatórios previstos na legislação aplicável permanecem preservados.",
        ],
      },
      {
        id: "propriedade-intelectual",
        title: "12. Propriedade intelectual",
        paragraphs: [
          "A Atendly e seus licenciadores mantêm os direitos sobre software, marcas, interfaces, documentação e demais elementos da Plataforma. Estes Termos concedem apenas direito limitado, revogável, não exclusivo e intransferível de uso durante a relação contratual.",
          "O Cliente mantém os direitos que possuir sobre seu Conteúdo e concede as permissões estritamente necessárias para operar, proteger e melhorar o serviço dentro da legislação e da Política de Privacidade.",
        ],
      },
      {
        id: "disponibilidade",
        title: "13. Disponibilidade, atualizações e manutenção",
        paragraphs: [
          "A Plataforma pode passar por manutenção, correções e atualizações. Interrupções planejadas relevantes serão comunicadas quando viável.",
          "Não se garante operação ininterrupta, sobretudo quando houver falhas de internet, dispositivos, WhatsApp/Meta ou outros terceiros, sem prejuízo de níveis de serviço expressamente contratados.",
        ],
      },
      {
        id: "suspensao",
        title: "14. Suspensão e encerramento",
        paragraphs: [
          "A conta pode ser suspensa ou encerrada por solicitação do Cliente, inadimplência aplicável, risco de segurança, ordem legal ou violação material destes Termos, com aviso e oportunidade de correção quando compatíveis com a urgência e a lei.",
          "Após o encerramento, o tratamento e a exclusão de dados seguirão obrigações legais, instruções válidas e os critérios da Política de Privacidade.",
        ],
      },
      {
        id: "responsabilidade",
        title: "15. Limitações de responsabilidade",
        paragraphs: [
          "Cada parte responde pelos danos diretos que causar conforme sua atuação e a legislação aplicável. Limitações contratuais não se aplicam quando proibidas por lei, nem afastam responsabilidade por dolo, fraude ou outras hipóteses inderrogáveis.",
          "A Atendly não responde por decisões autônomas do Cliente, conteúdo inserido por ele ou atos de terceiros fora de seu controle, sem prejuízo de responsabilidade legal por falhas próprias.",
        ],
      },
      {
        id: "alteracoes",
        title: "16. Alterações, versões e nova aceitação",
        paragraphs: [
          "Mudanças materiais serão identificadas por nova versão e data. Quando necessário, a Atendly solicitará nova aceitação antes da continuidade do uso.",
          "Versões anteriores e registros de aceite serão mantidos pelo período necessário para demonstrar a relação contratual e cumprir obrigações legais.",
        ],
      },
      {
        id: "lei-foro",
        title: "17. Legislação aplicável e foro",
        paragraphs: [
          `Aplicam-se as leis brasileiras. O foro contratual ainda depende de confirmação: ${details.applicableForum}. Essa indicação não limita foro obrigatório, direito do consumidor ou outra competência inderrogável prevista em lei.`,
        ],
      },
      {
        id: "atendimento",
        title: "18. Canal de atendimento",
        paragraphs: [
          `Dúvidas sobre estes Termos podem ser enviadas para ${details.supportEmail}. Solicitações sobre dados pessoais devem usar ${details.privacyEmail}.`,
        ],
      },
    ],
  };
}
