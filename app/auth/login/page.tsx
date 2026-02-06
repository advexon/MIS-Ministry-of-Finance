'use client'

import React from "react"
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
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Image from 'next/image'
import { Building2, Globe, Loader2 } from 'lucide-react'

const languages = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'ru', label: 'Русский', flag: 'RU' },
  { code: 'tj', label: 'Тоҷикӣ', flag: 'TJ' },
]

const translations = {
  en: {
    title: 'Sign in to PRSF MIS',
    description: 'Enter your credentials to access the Loan Tracking System',
    email: 'Email',
    password: 'Password',
    login: 'Sign In',
    loggingIn: 'Signing in...',
    noAccount: "Don't have an account?",
    signUp: 'Request Access',
    forgotPassword: 'Forgot password?',
    prsfTitle: 'Partial Risk Sharing Facility',
    ministryName: 'Ministry of Finance of the Republic of Tajikistan',
  },
  ru: {
    title: 'Вход в СИУ ФРЧР',
    description: 'Введите учетные данные для доступа к системе отслеживания кредитов',
    email: 'Электронная почта',
    password: 'Пароль',
    login: 'Войти',
    loggingIn: 'Вход...',
    noAccount: 'Нет аккаунта?',
    signUp: 'Запросить доступ',
    forgotPassword: 'Забыли пароль?',
    prsfTitle: 'Фонд разделения частичных рисков',
    ministryName: 'Министерство финансов Республики Таджикистан',
  },
  tj: {
    title: 'Воридшавӣ ба СИИ ФТСК',
    description: 'Маълумоти худро барои дастрасӣ ба системаи пайгирии қарз ворид кунед',
    email: 'Почтаи электронӣ',
    password: 'Рамз',
    login: 'Воридшавӣ',
    loggingIn: 'Воридшавӣ...',
    noAccount: 'Аккаунт надоред?',
    signUp: 'Дархости дастрасӣ',
    forgotPassword: 'Рамзро фаромӯш кардед?',
    prsfTitle: 'Фонди тақсимоти хатарҳои қисман',
    ministryName: 'Вазорати молияи Ҷумҳурии Тоҷикистон',
  },
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [language, setLanguage] = useState<'en' | 'ru' | 'tj'>('en')
  const router = useRouter()
  
  const t = translations[language]

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Emblem of Tajikistan" width={40} height={40} className="rounded-lg" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">PRSF MIS</h1>
            <p className="text-xs text-muted-foreground">{t.prsfTitle}</p>
          </div>
        </div>
        <Select value={language} onValueChange={(v) => setLanguage(v as 'en' | 'ru' | 'tj')}>
          <SelectTrigger className="w-32">
            <Globe className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="font-medium">{lang.flag}</span> {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-md">
          {/* Ministry Badge */}
          <div className="mb-6 flex items-center justify-center gap-2 text-center">
            <Building2 className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              {t.ministryName}
            </span>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader className="space-y-1 pb-4 text-center">
              <CardTitle className="text-2xl font-bold">{t.title}</CardTitle>
              <CardDescription className="text-balance">
                {t.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin}>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">{t.email}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@bank.tj"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">{t.password}</Label>
                      <Link
                        href="/auth/forgot-password"
                        className="text-xs text-primary hover:underline"
                      >
                        {t.forgotPassword}
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}
                  <Button type="submit" className="h-11 w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.loggingIn}
                      </>
                    ) : (
                      t.login
                    )}
                  </Button>
                </div>
                <div className="mt-6 text-center text-sm text-muted-foreground">
                  {t.noAccount}{' '}
                  <Link
                    href="/auth/sign-up"
                    className="font-medium text-primary hover:underline"
                  >
                    {t.signUp}
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            World Bank FPSDP Project - Financial and Private Sector Development
          </p>
        </div>
      </main>
    </div>
  )
}
