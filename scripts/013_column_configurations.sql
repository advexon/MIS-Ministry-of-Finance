-- Column Configuration Table for dynamic form/table customization
-- Allows superadmins to configure visibility and requirement status of loan application fields

CREATE TABLE IF NOT EXISTS column_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Entity this column belongs to (e.g., 'loan_applications', 'borrowers')
  entity_type TEXT NOT NULL DEFAULT 'loan_applications',
  
  -- Column/field identifier (matches database column or form field name)
  column_key TEXT NOT NULL,
  
  -- Display settings
  display_name_en TEXT NOT NULL,
  display_name_ru TEXT,
  display_name_tj TEXT,
  description_en TEXT,
  description_ru TEXT,
  description_tj TEXT,
  
  -- Field grouping for UI organization
  field_group TEXT NOT NULL DEFAULT 'general',
  
  -- Visibility controls
  is_visible_in_table BOOLEAN NOT NULL DEFAULT true,
  is_visible_in_form BOOLEAN NOT NULL DEFAULT true,
  is_visible_in_detail BOOLEAN NOT NULL DEFAULT true,
  
  -- Requirement controls
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_system_required BOOLEAN NOT NULL DEFAULT false, -- Cannot be made optional (e.g., bank_id)
  
  -- Validation settings
  validation_type TEXT, -- 'text', 'number', 'date', 'email', 'phone', 'tin', 'currency', 'percentage'
  min_value NUMERIC,
  max_value NUMERIC,
  min_length INTEGER,
  max_length INTEGER,
  regex_pattern TEXT,
  
  -- UI settings
  input_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'number', 'select', 'date', 'textarea', 'checkbox'
  placeholder_en TEXT,
  placeholder_ru TEXT,
  placeholder_tj TEXT,
  help_text_en TEXT,
  help_text_ru TEXT,
  help_text_tj TEXT,
  
  -- Ordering
  display_order INTEGER NOT NULL DEFAULT 0,
  table_column_order INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  -- Ensure unique column per entity
  UNIQUE(entity_type, column_key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_column_config_entity ON column_configurations(entity_type);
CREATE INDEX IF NOT EXISTS idx_column_config_group ON column_configurations(field_group);

-- Audit table for configuration changes
CREATE TABLE IF NOT EXISTS column_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES column_configurations(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete'
  previous_values JSONB,
  new_values JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default configurations for loan_applications entity
INSERT INTO column_configurations (entity_type, column_key, display_name_en, display_name_ru, display_name_tj, field_group, is_visible_in_table, is_visible_in_form, is_required, is_system_required, input_type, display_order, table_column_order) VALUES
-- Borrower Information (Group 1)
('loan_applications', 'borrower_name', 'Borrower Name', 'Наименование заемщика', 'Номи қарзгиранда', 'borrower', true, true, true, true, 'text', 1, 1),
('loan_applications', 'borrower_tin', 'TIN', 'ИНН', 'РМА', 'borrower', true, true, true, true, 'text', 2, 2),
('loan_applications', 'borrower_address', 'Address', 'Адрес', 'Суроға', 'borrower', false, true, false, false, 'textarea', 3, 0),
('loan_applications', 'borrower_phone', 'Phone', 'Телефон', 'Телефон', 'borrower', false, true, false, false, 'text', 4, 0),
('loan_applications', 'borrower_email', 'Email', 'Email', 'Email', 'borrower', false, true, false, false, 'text', 5, 0),
('loan_applications', 'sector_id', 'Business Sector', 'Сектор деятельности', 'Соҳаи фаъолият', 'borrower', true, true, false, false, 'select', 6, 3),

-- Legal Representative (Group 2)
('loan_applications', 'legal_rep_name', 'Legal Representative', 'Законный представитель', 'Намояндаи қонунӣ', 'legal_rep', false, true, false, false, 'text', 10, 0),
('loan_applications', 'legal_rep_position', 'Position', 'Должность', 'Вазифа', 'legal_rep', false, true, false, false, 'text', 11, 0),
('loan_applications', 'legal_rep_phone', 'Rep Phone', 'Телефон представителя', 'Телефони намоянда', 'legal_rep', false, true, false, false, 'text', 12, 0),
('loan_applications', 'legal_rep_tin', 'TIN Number', 'ИНН представителя', 'РМА-и намоянда', 'legal_rep', false, true, true, true, 'text', 13, 0),

-- Loan Details (Group 3)
('loan_applications', 'bank_id', 'Bank', 'Банк', 'Бонк', 'loan', true, true, true, true, 'select', 20, 4),
('loan_applications', 'branch_id', 'Branch', 'Филиал', 'Филиал', 'loan', false, true, false, false, 'select', 21, 0),
('loan_applications', 'loan_officer', 'Loan Officer', 'Кредитный специалист', 'Мутахассиси қарз', 'loan', false, true, false, false, 'text', 22, 0),
('loan_applications', 'product_id', 'Loan Product', 'Кредитный продукт', 'Маҳсулоти қарзӣ', 'loan', false, true, false, false, 'select', 23, 0),
('loan_applications', 'purpose', 'Loan Purpose', 'Цель кредита', 'Мақсади қарз', 'loan', true, true, true, false, 'textarea', 24, 5),
('loan_applications', 'requested_amount', 'Requested Amount', 'Запрашиваемая сумма', 'Маблағи дархостшуда', 'loan', true, true, true, true, 'currency', 25, 6),
('loan_applications', 'currency', 'Currency', 'Валюта', 'Асъор', 'loan', true, true, true, true, 'select', 26, 7),
('loan_applications', 'loan_term_months', 'Loan Term (months)', 'Срок кредита (месяцев)', 'Мӯҳлати қарз (моҳ)', 'loan', true, true, true, false, 'number', 27, 8),
('loan_applications', 'grace_period_months', 'Grace Period (months)', 'Льготный период (месяцев)', 'Давраи имтиёзӣ (моҳ)', 'loan', false, true, false, false, 'number', 28, 0),
('loan_applications', 'interest_rate', 'Interest Rate (%)', 'Процентная ставка (%)', 'Фоизи қарз (%)', 'loan', true, true, true, false, 'percentage', 29, 9),
('loan_applications', 'repayment_frequency', 'Repayment Frequency', 'Периодичность погашения', 'Тартиби пардохт', 'loan', false, true, false, false, 'select', 30, 0),

-- Guarantee Details (Group 4)
('loan_applications', 'guarantee_coverage', 'Guarantee Coverage (%)', 'Покрытие гарантии (%)', 'Ҳаҷми кафолат (%)', 'guarantee', true, true, true, true, 'percentage', 40, 10),
('loan_applications', 'guarantee_amount', 'Guarantee Amount', 'Сумма гарантии', 'Маблағи кафолат', 'guarantee', true, false, false, false, 'currency', 41, 11),

-- Collateral Information (Group 5)
('loan_applications', 'collateral_type', 'Collateral Type', 'Тип залога', 'Навъи гарав', 'collateral', false, true, false, false, 'select', 50, 0),
('loan_applications', 'collateral_value', 'Collateral Value', 'Стоимость залога', 'Арзиши гарав', 'collateral', false, true, false, false, 'currency', 51, 0),
('loan_applications', 'collateral_description', 'Collateral Description', 'Описание залога', 'Тавсифи гарав', 'collateral', false, true, false, false, 'textarea', 52, 0),

-- Additional Information (Group 6)
('loan_applications', 'notes', 'Internal Notes', 'Внутренние заметки', 'Қайдҳои дохилӣ', 'additional', false, true, false, false, 'textarea', 60, 0),
('loan_applications', 'status', 'Status', 'Статус', 'Ҳолат', 'system', true, false, false, true, 'select', 70, 12),
('loan_applications', 'created_at', 'Created Date', 'Дата создания', 'Санаи эҷод', 'system', true, false, false, true, 'date', 71, 13)

ON CONFLICT (entity_type, column_key) DO NOTHING;

-- Enable RLS
ALTER TABLE column_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_config_audit ENABLE ROW LEVEL SECURITY;

-- Policies for column_configurations
CREATE POLICY "Allow read for authenticated users" ON column_configurations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write for admins" ON column_configurations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.tier <= 2
    )
  );

-- Policies for audit table
CREATE POLICY "Allow read for admins" ON column_config_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.tier <= 2
    )
  );

CREATE POLICY "Allow insert for admins" ON column_config_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.tier <= 2
    )
  );
