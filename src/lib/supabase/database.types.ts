export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      trilha: {
        Row: {
          id: string;
          codigo: string;
          nome: string;
          nome_curto: string;
          slug: string;
          descricao: string;
          icone: string;
          ordem: number;
          ativa: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          codigo: string;
          nome: string;
          nome_curto: string;
          slug: string;
          descricao: string;
          icone: string;
          ordem?: number;
          ativa?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["trilha"]["Insert"]>;
      };
      aluno: {
        Row: {
          id: string;
          nome_completo: string;
          email: string;
          cpf: string | null;
          telefone: string | null;
          cargo: string | null;
          orgao: string | null;
          tipo_aluno: "PF" | "PJ" | "Servidor";
          user_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          nome_completo: string;
          email: string;
          cpf?: string | null;
          telefone?: string | null;
          cargo?: string | null;
          orgao?: string | null;
          tipo_aluno?: "PF" | "PJ" | "Servidor";
          user_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["aluno"]["Insert"]>;
      };
      instrutor: {
        Row: {
          id: string;
          nome: string;
          // Opcionais (REC-103): ausentes quando a linha vem da projeção
          // pública `instrutor_publico`, que não expõe contato de instrutor.
          email?: string | null;
          telefone?: string | null;
          user_id: string | null;
          bio: string | null;
          foto_url: string | null;
          formacao: string | null;
          especialidade: string | null;
          rating: number;
          status: "Ativo" | "Inativo";
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          nome: string;
          email?: string | null;
          telefone?: string | null;
          user_id?: string | null;
          bio?: string | null;
          foto_url?: string | null;
          formacao?: string | null;
          especialidade?: string | null;
          rating?: number;
          status?: "Ativo" | "Inativo";
        };
        Update: Partial<Database["public"]["Tables"]["instrutor"]["Insert"]>;
      };
      // REC-103: projeção pública de `instrutor` (allowlist de colunas,
      // sem email/telefone). Somente leitura — sem Insert/Update.
      instrutor_publico: {
        Row: {
          id: string;
          nome: string;
          bio: string | null;
          foto_url: string | null;
          formacao: string | null;
          especialidade: string | null;
          rating: number;
          status: "Ativo" | "Inativo";
        };
        Insert: never;
        Update: never;
      };
      curso: {
        Row: {
          id: string;
          titulo: string;
          slug: string;
          descricao_curta: string | null;
          descricao: string | null;
          ementa: Json;
          objetivos: Json;
          beneficios: Json;
          publico_alvo: Json;
          carga_horaria: number;
          modalidade: "Presencial" | "Online" | "Hibrido" | "InCompany" | "Gravado";
          modalidades: ("Presencial" | "Online" | "Hibrido" | "InCompany" | "Gravado")[];
          nivel: "Basico" | "Intermediario" | "Avancado" | "Misto";
          categoria: string | null;
          categorias: string[];
          trilha_id: string | null;
          trilha_nome: string | null;
          preco_base: number;
          status: "Ativo" | "Inativo" | "Destaque" | "EmBreve" | "Rascunho" | "Arquivado";
          destaque: boolean;
          imagem_capa: string | null;
          rating: number;
          total_alunos: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          titulo: string;
          slug: string;
          descricao_curta?: string | null;
          descricao?: string | null;
          ementa?: Json;
          objetivos?: Json;
          beneficios?: Json;
          publico_alvo?: Json;
          carga_horaria?: number;
          modalidade?: "Presencial" | "Online" | "Hibrido" | "InCompany" | "Gravado";
          modalidades?: ("Presencial" | "Online" | "Hibrido" | "InCompany" | "Gravado")[];
          nivel?: "Basico" | "Intermediario" | "Avancado" | "Misto";
          categoria?: string | null;
          categorias?: string[];
          trilha_id?: string | null;
          trilha_nome?: string | null;
          preco_base?: number;
          status?: "Ativo" | "Inativo" | "Destaque" | "EmBreve" | "Rascunho" | "Arquivado";
          destaque?: boolean;
          imagem_capa?: string | null;
          rating?: number;
          total_alunos?: number;
        };
        Update: Partial<Database["public"]["Tables"]["curso"]["Insert"]>;
      };
      curso_public_content: {
        Row: {
          id: string;
          curso_id: string;
          hero_subtitle: string | null;
          highlights: Json;
          faq_items: Json;
          sidebar: Json;
          corporate_cta: Json;
          testimonial_override: Json;
          published: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          curso_id: string;
          hero_subtitle?: string | null;
          highlights?: Json;
          faq_items?: Json;
          sidebar?: Json;
          corporate_cta?: Json;
          testimonial_override?: Json;
          published?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["curso_public_content"]["Insert"]>;
      };
      curso_instrutor: {
        Row: {
          id: string;
          curso_id: string;
          instrutor_id: string;
          principal: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          curso_id: string;
          instrutor_id: string;
          principal?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["curso_instrutor"]["Insert"]>;
      };
      turma: {
        Row: {
          id: string;
          curso_id: string;
          instrutor_id: string | null;
          data_inicio: string;
          data_fim: string | null;
          horario: string | null;
          local: string | null;
          vagas_total: number;
          vagas_preenchidas: number;
          vagas_restantes: number;
          preco_turma: number;
          modalidade: "Presencial" | "Online" | "Hibrido" | "InCompany" | "Gravado";
          status: "Aberta" | "PoucasVagas" | "Encerrada" | "Cancelada" | "Realizada" | "EmBreve";
          // Opcional (REC-103): ausente quando a linha vem da projeção
          // pública `turma_publica`, que não expõe a observação interna.
          observacoes?: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          curso_id: string;
          instrutor_id?: string | null;
          data_inicio: string;
          data_fim?: string | null;
          horario?: string | null;
          local?: string | null;
          vagas_total?: number;
          vagas_preenchidas?: number;
          preco_turma?: number;
          modalidade?: "Presencial" | "Online" | "Hibrido" | "InCompany" | "Gravado";
          status?: "Aberta" | "PoucasVagas" | "Encerrada" | "Cancelada" | "Realizada" | "EmBreve";
          observacoes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["turma"]["Insert"]>;
      };
      // REC-103: projeção pública de `turma` (allowlist de colunas, sem
      // observacoes). Somente leitura — sem Insert/Update.
      turma_publica: {
        Row: {
          id: string;
          curso_id: string;
          instrutor_id: string | null;
          data_inicio: string;
          data_fim: string | null;
          horario: string | null;
          local: string | null;
          vagas_total: number;
          vagas_preenchidas: number;
          vagas_restantes: number;
          preco_turma: number;
          modalidade: "Presencial" | "Online" | "Hibrido" | "InCompany" | "Gravado";
          status: "Aberta" | "PoucasVagas" | "Encerrada" | "Cancelada" | "Realizada" | "EmBreve";
        };
        Insert: never;
        Update: never;
      };
      inscricao: {
        Row: {
          id: string;
          aluno_id: string;
          turma_id: string;
          status_inscricao: "Pendente" | "AguardandoPagamento" | "Confirmada" | "Cancelada" | "Concluida" | "ListaEspera";
          status_pagamento: "Pendente" | "Pago" | "Estornado" | "Isento" | "Cancelado";
          valor_pago: number;
          forma_pagamento: "Pix" | "Cartao" | "Boleto" | "Empenho" | null;
          codigo_confirmacao: string;
          tipo_inscricao: string | null;
          observacoes: string | null;
          certificado_emitido: boolean;
          created_at: string;
          updated_at: string;
          cancelled_at: string | null;
        };
        Insert: {
          id?: string;
          aluno_id: string;
          turma_id: string;
          status_inscricao?: "Pendente" | "AguardandoPagamento" | "Confirmada" | "Cancelada" | "Concluida" | "ListaEspera";
          status_pagamento?: "Pendente" | "Pago" | "Estornado" | "Isento" | "Cancelado";
          valor_pago?: number;
          forma_pagamento?: "Pix" | "Cartao" | "Boleto" | "Empenho" | null;
          codigo_confirmacao?: string;
          tipo_inscricao?: string | null;
          observacoes?: string | null;
          certificado_emitido?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["inscricao"]["Insert"]>;
      };
      lead: {
        Row: {
          id: string;
          nome: string;
          email: string | null;
          telefone: string | null;
          tipo: "Curso" | "InCompany" | "Mentoria" | "Newsletter" | "Orcamento" | "Contato";
          orgao: string | null;
          num_participantes: number | null;
          tema_interesse: string | null;
          curso_id: string | null;
          status_crm: "Novo" | "Contatado" | "EmAtendimento" | "PropostaEnviada" | "Convertido" | "Perdido";
          mensagem: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_term: string | null;
          utm_content: string | null;
          origem: string | null;
          modalidade_preferida: string | null;
          objetivo_treinamento: string | null;
          tema_treinamento: string | null;
          desafios_principais: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          nome: string;
          email?: string | null;
          telefone?: string | null;
          tipo?: "Curso" | "InCompany" | "Mentoria" | "Newsletter" | "Orcamento" | "Contato";
          orgao?: string | null;
          num_participantes?: number | null;
          tema_interesse?: string | null;
          curso_id?: string | null;
          status_crm?: "Novo" | "Contatado" | "EmAtendimento" | "PropostaEnviada" | "Convertido" | "Perdido";
          mensagem?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_term?: string | null;
          utm_content?: string | null;
          origem?: string | null;
          modalidade_preferida?: string | null;
          objetivo_treinamento?: string | null;
          tema_treinamento?: string | null;
          desafios_principais?: string | null;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["lead"]["Insert"]>;
      };
      lead_email_sequence: {
        Row: {
          id: string;
          lead_id: string;
          campaign_key: string;
          status: "ACTIVE" | "INTERRUPTED" | "COMPLETED";
          started_at: string;
          completed_at: string | null;
          interrupted_at: string | null;
          interruption_reason: string | null;
          interruption_event_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          campaign_key: string;
          status?: "ACTIVE" | "INTERRUPTED" | "COMPLETED";
          started_at?: string;
          completed_at?: string | null;
          interrupted_at?: string | null;
          interruption_reason?: string | null;
          interruption_event_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["lead_email_sequence"]["Insert"]>;
      };
      lead_email_sequence_step: {
        Row: {
          id: string;
          sequence_id: string;
          step_index: number;
          due_at: string;
          status: "PENDING" | "SENT" | "CANCELLED" | "SKIPPED";
          sent_at: string | null;
          cancelled_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sequence_id: string;
          step_index: number;
          due_at: string;
          status?: "PENDING" | "SENT" | "CANCELLED" | "SKIPPED";
          sent_at?: string | null;
          cancelled_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["lead_email_sequence_step"]["Insert"]>;
      };
      lead_email_message: {
        Row: {
          id: string;
          lead_id: string;
          sequence_id: string | null;
          sequence_step_id: string | null;
          provider: "SES" | "IMAP";
          provider_message_id: string;
          rfc_message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          sequence_id?: string | null;
          sequence_step_id?: string | null;
          provider: "SES" | "IMAP";
          provider_message_id: string;
          rfc_message_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["lead_email_message"]["Insert"]>;
      };
      lead_email_suppression: {
        Row: {
          lead_id: string;
          reason: "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED";
          source_event_id: string;
          suppressed_at: string;
          created_at: string;
        };
        Insert: {
          lead_id: string;
          reason: "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED";
          source_event_id: string;
          suppressed_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_email_suppression"]["Insert"]>;
      };
      lead_interaction: {
        Row: {
          id: string;
          lead_id: string;
          message_id: string | null;
          sequence_id: string | null;
          external_event_id: string | null;
          event_type: "SENT" | "DELIVERED" | "OPENED" | "CLICKED" | "REPLIED" | "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED";
          occurred_at: string;
          recorded_at: string;
          channel: "EMAIL";
          direction: "OUTBOUND" | "INBOUND";
          source: "SES" | "IMAP" | "CRM" | "INTERNAL";
          correlation_id: string;
          causation_id: string | null;
          actor_id: string;
          actor_version: string;
          safe_summary: string;
          content_ref: string | null;
          content_hash: string | null;
          metadata: Json;
          idempotency_key: string;
          event_hash: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          message_id?: string | null;
          sequence_id?: string | null;
          external_event_id?: string | null;
          event_type: Database["public"]["Tables"]["lead_interaction"]["Row"]["event_type"];
          occurred_at: string;
          recorded_at?: string;
          channel?: "EMAIL";
          direction: "OUTBOUND" | "INBOUND";
          source: "SES" | "IMAP" | "CRM" | "INTERNAL";
          correlation_id: string;
          causation_id?: string | null;
          actor_id: string;
          actor_version: string;
          safe_summary: string;
          content_ref?: string | null;
          content_hash?: string | null;
          metadata?: Json;
          idempotency_key: string;
          event_hash: string;
        };
        Update: never;
      };
      post_blog: {
        Row: {
          id: string;
          titulo: string;
          slug: string;
          resumo: string;
          conteudo: string;
          categoria: string;
          tags: Json;
          autor: string;
          publicado_em: string | null;
          tempo_leitura: string | null;
          status: "Rascunho" | "Em revisão" | "Agendado" | "Publicado" | "Arquivado";
          imagem_url: string | null;
          curso_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          agendado_em?: string | null;
          conteudo_formato?: string;
          imagem_alt?: string | null;
          seo_titulo?: string | null;
          seo_descricao?: string | null;
          canonical_url?: string | null;
          og_image_url?: string | null;
          revisao_atual?: number;
          autor_id?: string | null;
          criado_por?: string | null;
          atualizado_por?: string | null;
          publicado_por?: string | null;
        };
        Insert: {
          id?: string;
          titulo: string;
          slug: string;
          resumo: string;
          conteudo: string;
          categoria: string;
          tags?: Json;
          autor: string;
          publicado_em?: string | null;
          tempo_leitura?: string | null;
          status?: "Rascunho" | "Em revisão" | "Agendado" | "Publicado" | "Arquivado";
          imagem_url?: string | null;
          curso_id?: string | null;
          deleted_at?: string | null;
          agendado_em?: string | null;
          conteudo_formato?: string;
          imagem_alt?: string | null;
          seo_titulo?: string | null;
          seo_descricao?: string | null;
          canonical_url?: string | null;
          og_image_url?: string | null;
          revisao_atual?: number;
          autor_id?: string | null;
          criado_por?: string | null;
          atualizado_por?: string | null;
          publicado_por?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["post_blog"]["Insert"]>;
      };
      avaliacao: {
        Row: {
          id: string;
          inscricao_id: string;
          turma_id: string;
          nota: number;
          comentario: string | null;
          publicar: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          inscricao_id: string;
          turma_id: string;
          nota: number;
          comentario?: string | null;
          publicar?: boolean;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["avaliacao"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          role: "student" | "instructor" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: "student" | "instructor" | "admin";
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      certificado: {
        Row: {
          id: string;
          inscricao_id: string;
          numero_certificado: string;
          data_emissao: string;
          pdf_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inscricao_id: string;
          numero_certificado: string;
          data_emissao?: string;
          pdf_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["certificado"]["Insert"]>;
      };
      pagamento: {
        Row: {
          id: string;
          inscricao_id: string;
          valor: number;
          forma_pagamento: "Pix" | "Cartao" | "Boleto" | "Empenho" | null;
          status: "Pendente" | "Pago" | "Estornado" | "Isento" | "Cancelado";
          data_pagamento: string | null;
          gateway_ref: string | null;
          parcelas: number | null;
          gateway: "ASAAS" | null;
          gateway_status:
            | "CREATING"
            | "CREATION_UNKNOWN"
            | "ACTIVE"
            | "FAILED"
            | "PAID"
            | "CANCELED"
            | "EXPIRED"
            | "MANUAL_REVIEW"
            | null;
          checkout_expires_at: string | null;
          checkout_criou_aluno: boolean;
          idempotency_key: string | null;
          request_hash: string | null;
          observacoes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inscricao_id: string;
          valor: number;
          forma_pagamento?: "Pix" | "Cartao" | "Boleto" | "Empenho" | null;
          status?: "Pendente" | "Pago" | "Estornado" | "Isento" | "Cancelado";
          data_pagamento?: string | null;
          gateway_ref?: string | null;
          parcelas?: number | null;
          gateway?: "ASAAS" | null;
          gateway_status?:
            | "CREATING"
            | "CREATION_UNKNOWN"
            | "ACTIVE"
            | "FAILED"
            | "PAID"
            | "CANCELED"
            | "EXPIRED"
            | "MANUAL_REVIEW"
            | null;
          checkout_expires_at?: string | null;
          checkout_criou_aluno?: boolean;
          idempotency_key?: string | null;
          request_hash?: string | null;
          observacoes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pagamento"]["Insert"]>;
      };
      pagamento_gateway_evento: {
        Row: {
          id: string;
          gateway: "ASAAS";
          gateway_event_id: string;
          event_type:
            | "CHECKOUT_CREATED"
            | "CHECKOUT_PAID"
            | "CHECKOUT_CANCELED"
            | "CHECKOUT_EXPIRED";
          gateway_ref: string | null;
          pagamento_id: string | null;
          normalized_hash: string;
          event_created_at: string | null;
          processing_status: "RECEIVED" | "PROCESSED" | "RETRYABLE_ERROR";
          processing_error: string | null;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          gateway?: "ASAAS";
          gateway_event_id: string;
          event_type:
            | "CHECKOUT_CREATED"
            | "CHECKOUT_PAID"
            | "CHECKOUT_CANCELED"
            | "CHECKOUT_EXPIRED";
          gateway_ref?: string | null;
          pagamento_id?: string | null;
          normalized_hash: string;
          event_created_at?: string | null;
          processing_status?: "RECEIVED" | "PROCESSED" | "RETRYABLE_ERROR";
          processing_error?: string | null;
          processed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pagamento_gateway_evento"]["Insert"]>;
      };
    };
    Functions: {
      sales_campaign_pending_notifications: {
        Args: { p_campaign_key: string };
        Returns: number;
      };
      registrar_inscricao_publica: {
        Args: {
          p_nome_completo: string;
          p_email: string;
          p_cpf: string;
          p_telefone: string;
          p_cargo: string;
          p_orgao: string;
          p_tipo_aluno: "PF" | "PJ" | "Servidor";
          p_turma_id: string;
          p_tipo_inscricao: string;
          p_forma_pagamento: "Pix" | "Cartao" | "Boleto" | "Empenho";
          p_observacoes?: string | null;
        };
        Returns: string;
      };
      iniciar_checkout_asaas_dp_zero: {
        Args: {
          p_idempotency_key: string;
          p_nome_completo: string;
          p_email: string;
          p_cpf: string;
          p_telefone: string;
          p_minutes_to_expire?: number;
        };
        Returns: Array<{
          aluno_id: string;
          inscricao_id: string;
          pagamento_id: string;
          gateway_status: string;
          idempotency_key: string;
          created: boolean;
        }>;
      };
      vincular_checkout_asaas: {
        Args: {
          p_pagamento_id: string;
          p_gateway_ref: string;
          p_checkout_expires_at: string;
        };
        Returns: string;
      };
      marcar_checkout_asaas_creation_unknown: {
        Args: { p_pagamento_id: string };
        Returns: string;
      };
      marcar_checkout_asaas_failed: {
        Args: { p_pagamento_id: string };
        Returns: string;
      };
      processar_evento_checkout_asaas: {
        Args: {
          p_event_id: string;
          p_event_type: string;
          p_gateway_ref: string;
          p_external_reference: string;
          p_normalized_hash: string;
          p_event_created_at?: string | null;
          p_valor?: number | null;
          p_forma_pagamento?: "Pix" | "Cartao" | null;
          p_parcelas?: number | null;
        };
        Returns: Array<{
          event_status: string;
          payment_gateway_status: string | null;
          processed: boolean;
          duplicate: boolean;
        }>;
      };
      ingest_lead_interaction: {
        Args: {
          p_lead_id: string;
          p_message_id: string | null;
          p_sequence_id: string | null;
          p_external_event_id: string | null;
          p_event_type: string;
          p_occurred_at: string;
          p_direction: string;
          p_source: string;
          p_correlation_id: string;
          p_causation_id: string | null;
          p_actor_id: string;
          p_actor_version: string;
          p_safe_summary: string;
          p_content_ref: string | null;
          p_content_hash: string | null;
          p_metadata: Json;
          p_idempotency_key: string;
          p_event_hash: string;
        };
        Returns: Array<{
          interaction_id: string;
          duplicate: boolean;
          sequence_interrupted: boolean;
        }>;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_instructor: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_student: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
  };
};
