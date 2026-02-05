-- PRSF Loan Tracking MIS - Seed Data

-- Insert Roles
INSERT INTO roles (code, name_en, name_ru, name_tj, permissions) VALUES
  ('admin', 'Administrator', 'Администратор', 'Администратор', '["all"]'),
  ('prsf_director', 'PRSF Director', 'Директор ФРЧР', 'Директори ФТСК', '["view_all", "approve_loans", "manage_claims", "view_reports"]'),
  ('prsf_accountant', 'PRSF Accountant', 'Бухгалтер ФРЧР', 'Муҳосиби ФТСК', '["view_loans", "manage_fees", "view_reports"]'),
  ('prsf_analyst', 'PRSF Portfolio Credit Analyst', 'Кредитный аналитик ФРЧР', 'Таҳлилгари қарзии ФТСК', '["view_loans", "review_loans", "view_reports"]'),
  ('prsf_reporter', 'PRSF Reporter', 'Отчетчик ФРЧР', 'Ҳисоботдиҳандаи ФТСК', '["view_loans", "view_reports", "export_reports"]'),
  ('auditor', 'Auditor', 'Аудитор', 'Аудитор', '["view_all", "view_audit_trail"]'),
  ('bank_manager', 'Bank Manager', 'Менеджер банка', 'Мудири бонк', '["view_own_loans", "submit_loans", "submit_reports", "submit_claims"]'),
  ('bank_employee', 'Bank Employee', 'Сотрудник банка', 'Кормандони бонк', '["view_own_loans", "submit_loans", "submit_reports"]')
ON CONFLICT (code) DO NOTHING;

-- Insert Banks (Sample Tajik banks)
INSERT INTO banks (code, name_en, name_ru, name_tj) VALUES
  ('AGROINVEST', 'Agroinvestbank', 'Агроинвестбанк', 'Агроинвестбонк'),
  ('AMONATBANK', 'Amonatbonk', 'Амонатбонк', 'Амонатбонк'),
  ('SPITAMEN', 'Spitamen Bank', 'Спитамен Банк', 'Бонки Спитамен'),
  ('IMON', 'IMON International', 'ИМОН Интернешнл', 'ИМОН Интернешнл'),
  ('ESKHATA', 'Bank Eskhata', 'Банк Эсхата', 'Бонки Эсхата'),
  ('ARVAND', 'Arvand Bank', 'Банк Арванд', 'Бонки Арванд'),
  ('FIRST_MICRO', 'First Microfinance Bank', 'Первый Микрофинансовый Банк', 'Бонки Аввалини Микромолия'),
  ('HALYK', 'Halyk Bank Tajikistan', 'Халык Банк Таджикистан', 'Халық Бонки Тоҷикистон'),
  ('TCSE', 'Tajik-Chinese Savings Bank', 'Таджикско-Китайский Сберегательный Банк', 'Бонки Пасандози Тоҷикистону Чин'),
  ('ORIENBANK', 'Orienbank', 'Ориенбанк', 'Ориенбонк')
ON CONFLICT (code) DO NOTHING;

-- Insert Bank Branches (Sample)
INSERT INTO bank_branches (bank_id, code, name_en, name_ru, name_tj, city, district) 
SELECT b.id, 'HQ', 'Head Office', 'Головной офис', 'Идораи марказӣ', 'Dushanbe', 'Dushanbe'
FROM banks b
ON CONFLICT DO NOTHING;

INSERT INTO bank_branches (bank_id, code, name_en, name_ru, name_tj, city, district) 
SELECT b.id, 'KHUJAND', 'Khujand Branch', 'Филиал Худжанд', 'Филиали Хуҷанд', 'Khujand', 'Sughd'
FROM banks b WHERE b.code = 'AGROINVEST'
ON CONFLICT DO NOTHING;

INSERT INTO bank_branches (bank_id, code, name_en, name_ru, name_tj, city, district) 
SELECT b.id, 'KULOB', 'Kulob Branch', 'Филиал Куляб', 'Филиали Кӯлоб', 'Kulob', 'Khatlon'
FROM banks b WHERE b.code = 'AGROINVEST'
ON CONFLICT DO NOTHING;

-- Insert Economic Sectors
INSERT INTO sectors (code, name_en, name_ru, name_tj) VALUES
  ('AGRICULTURE', 'Agriculture', 'Сельское хозяйство', 'Кишоварзӣ'),
  ('MANUFACTURING', 'Manufacturing', 'Производство', 'Истеҳсолот'),
  ('TRADE', 'Trade & Commerce', 'Торговля', 'Савдо'),
  ('SERVICES', 'Services', 'Услуги', 'Хизматрасонӣ'),
  ('CONSTRUCTION', 'Construction', 'Строительство', 'Сохтмон'),
  ('TRANSPORT', 'Transport & Logistics', 'Транспорт и логистика', 'Нақлиёт ва логистика'),
  ('TOURISM', 'Tourism & Hospitality', 'Туризм и гостиничный бизнес', 'Сайёҳӣ ва меҳмондорӣ'),
  ('IT', 'Information Technology', 'Информационные технологии', 'Технологияҳои иттилоотӣ'),
  ('HEALTHCARE', 'Healthcare', 'Здравоохранение', 'Тандурустӣ'),
  ('EDUCATION', 'Education', 'Образование', 'Маориф'),
  ('FOOD_PROCESSING', 'Food Processing', 'Переработка продуктов питания', 'Коркарди маводи хӯрокворӣ'),
  ('TEXTILE', 'Textile & Garment', 'Текстиль и одежда', 'Нассоҷӣ ва либос'),
  ('OTHER', 'Other', 'Другое', 'Дигар')
ON CONFLICT (code) DO NOTHING;

-- Insert Loan Products
INSERT INTO loan_products (code, name_en, name_ru, name_tj, guarantee_coverage, upfront_fee_rate, quarterly_fee_rate) VALUES
  ('MSME_STANDARD', 'MSME Standard Guarantee', 'Стандартная гарантия ММСП', 'Кафолати стандартии ККМБ', 50.00, 0.0100, 0.0025),
  ('MSME_COVID', 'COVID-19 Recovery Program', 'Программа восстановления COVID-19', 'Барномаи барқарорсозии COVID-19', 70.00, 0.0075, 0.0020),
  ('WOMEN_ENTREPRENEUR', 'Women Entrepreneur Program', 'Программа для женщин-предпринимателей', 'Барномаи занони соҳибкор', 60.00, 0.0050, 0.0015),
  ('GREEN_FINANCE', 'Green Finance Program', 'Программа зеленого финансирования', 'Барномаи молияи сабз', 65.00, 0.0075, 0.0020),
  ('AGRI_SME', 'Agricultural SME Program', 'Программа МСП в сельском хозяйстве', 'Барномаи МКМ дар кишоварзӣ', 60.00, 0.0075, 0.0020),
  ('BLANKET_GUARANTEE', 'Blanket Guarantee', 'Бланковая гарантия', 'Кафолати бланкӣ', 50.00, 0.0100, 0.0025)
ON CONFLICT (code) DO NOTHING;

-- Insert System Settings
INSERT INTO system_settings (key, value, description) VALUES
  ('loan_threshold_director_approval', '{"amount": 500000, "currency": "TJS"}', 'Loans above this amount require PRSF Director approval'),
  ('default_guarantee_coverage', '{"percentage": 50}', 'Default guarantee coverage percentage'),
  ('report_submission_deadline', '{"day": 10}', 'Day of month by which banks must submit reports'),
  ('claim_processing_days', '{"days": 30}', 'Maximum days to process a claim'),
  ('recovery_follow_up_frequency', '{"months": 3}', 'Frequency of recovery follow-up reminders'),
  ('autosave_delay_seconds', '{"seconds": 30}', 'Autosave delay in seconds'),
  ('notification_email_enabled', '{"enabled": true}', 'Whether to send email notifications'),
  ('password_policy', '{"min_length": 8, "require_uppercase": true, "require_lowercase": true, "require_numbers": true, "require_special": true, "expiry_days": 90}', 'Password policy settings')
ON CONFLICT (key) DO NOTHING;
