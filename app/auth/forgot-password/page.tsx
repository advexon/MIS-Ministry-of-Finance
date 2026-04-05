'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import Image from 'next/image'
import { Globe, Loader2, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'

const languages = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'ru', label: 'Русский', flag: 'RU' },
  { code: 'tj', label: 'Тоҷикӣ', flag: 'TJ' },
]

const translations = {
  en: {
    title: 'Reset Password',
    description: 'Enter your email to receive a password reset link',
    email: 'Email Address',
    emailPlaceholder: 'Enter your email',
    submit: 'Send Reset Link',
    submitting: 'Sending...',
    backToLogin: 'Back to Sign In',
    ministry: 'Ministry of Finance of the Republic of Tajikistan',
    successTitle: 'Check Your Email',
    successMessage: 'If an account with that email exists, we have sent a password reset link. Please check your inbox and spam folder.',
    tryAgain: 'Send Another Link',
  },
  ru: {
    title: 'Сброс пароля',
    description: 'Введите ваш email для получения ссылки для сброса пароля',
    email: 'Электронная почта',
    emailPlaceholder: 'Введите email',
    submit: 'Отправить ссылку',
    submitting: 'Отправка...',
    backToLogin: 'Вернуться к входу',
    ministry: 'Министерство финансов Республики Таджикистан',
    successTitle: 'Проверьте почту',
    successMessage: 'Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля. Проверьте входящие и спам.',
    tryAgain: 'Отправить ещё раз',
  },
  tj: {
    title: 'Барқарорсозии рамз',
    description: 'Почтаи электрониро ворид кунед барои гирифтани истиноди барқарорсозӣ',
    email: 'Почтаи электронӣ',
    emailPlaceholder: 'Почтаи электрониро ворид кунед',
    submit: 'Фиристодани истинод',
    submitting: 'Фиристода шуда истодааст...',
    backToLogin: 'Бозгашт ба воридшавӣ',
    ministry: 'Вазорати молияи Ҷумҳурии Тоҷикистон',
    successTitle: 'Почтаро тафтиш кунед',
    successMessage: 'Агар аккаунт бо ин почта вуҷуд дошта бошад, мо истиноди барқарорсозиро фиристодем. Почтаи воридшуда ва спамро тафтиш кунед.',
    tryAgain: 'Боз фиристодан',
  },
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [language, setLanguage] = useState<'en' | 'ru' | 'tj'>('en')

  const t = translations[language]
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        throw error
      }

      setIsSuccess(true)
    } catch (err) {
      // Don't reveal if email exists or not for security
      setIsSuccess(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTryAgain = () => {
    setIsSuccess(false)
    setEmail('')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-100 p-4">
      {/* Language Switcher */}
      <div className="absolute right-4 top-4">
        <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
          <SelectTrigger className="w-[130px] bg-white/80 backdrop-blur">
            <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="mr-2">{lang.flag}</span>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader className="space-y-4 pb-6 text-center">
          <div className="mx-auto flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="PRSF Logo"
              width={80}
              height={80}
              className="h-20 w-20 object-contain"
              priority
            />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-800">
              {isSuccess ? t.successTitle : t.title}
            </CardTitle>
            <CardDescription className="text-slate-600">
              {isSuccess ? '' : t.description}
            </CardDescription>
            <p className="text-xs text-muted-foreground">{t.ministry}</p>
          </div>
        </CardHeader>

        <CardContent>
          {isSuccess ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4 rounded-lg bg-teal-50 p-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
                  <CheckCircle2 className="h-8 w-8 text-teal-600" />
                </div>
                <p className="text-sm text-slate-600">{t.successMessage}</p>
              </div>
              
              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  onClick={handleTryAgain}
                  className="w-full"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {t.tryAgain}
                </Button>
                <Link href="/auth/login" className="w-full">
                  <Button variant="ghost" className="w-full text-teal-700 hover:text-teal-800 hover:bg-teal-50">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t.backToLogin}
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
                  {error}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">{t.email}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-teal-600 hover:bg-teal-700"
                disabled={isLoading || !email}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.submitting}
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    {t.submit}
                  </>
                )}
              </Button>

              <div className="text-center">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center text-sm text-teal-600 hover:text-teal-700 hover:underline"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t.backToLogin}
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
