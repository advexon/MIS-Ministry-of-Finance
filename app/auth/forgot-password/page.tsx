'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useI18n } from '@/lib/i18n/context'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const translations = {
  en: {
    title: 'Contact your administrator',
    description: 'Accounts and password recovery are managed by your system administrator.',
    message: 'Ask your administrator to reset your password in User Management. Receive your new password through your organization’s approved secure channel. No email or verification link is required.',
    login: 'Back to sign in',
    label: 'Language',
  },
  ru: {
    title: 'Обратитесь к администратору',
    description: 'Учётные записи и восстановление паролей управляются системным администратором.',
    message: 'Попросите администратора сбросить пароль в разделе управления пользователями. Получите новый пароль по утверждённому защищённому каналу вашей организации. Письмо или ссылка для подтверждения не требуются.',
    login: 'Вернуться ко входу',
    label: 'Язык',
  },
  tj: {
    title: 'Ба маъмур муроҷиат кунед',
    description: 'Ҳисобҳо ва барқарорсозии рамзҳо аз ҷониби маъмури система идора мешаванд.',
    message: 'Аз маъмур хоҳиш кунед, ки рамзи шуморо дар бахши идоракунии корбарон иваз кунад. Рамзи навро тавассути канали бехатари тасдиқшудаи ташкилот гиред. Почтаи электронӣ ё истиноди тасдиқ лозим нест.',
    login: 'Бозгашт ба воридшавӣ',
    label: 'Забон',
  },
}

export default function ForgotPasswordPage() {
  const uiText = useUiTranslation()

  const { locale: language, setLocale: setLanguage } = useI18n()
  const t = translations[language]

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 font-sans text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {uiText(t.label)}
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as keyof typeof translations)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
              >
                <option value="en">{uiText("English")}</option>
                <option value="ru">Русский</option>
                <option value="tj">Тоҷикӣ</option>
              </select>
            </label>
          </div>
          <CardTitle className="text-balance">{uiText(t.title)}</CardTitle>
          <CardDescription>{uiText(t.description)}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{t.message}</p>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline">
            <Link href="/auth/login"><ArrowLeft data-icon="inline-start" />{t.login}</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
