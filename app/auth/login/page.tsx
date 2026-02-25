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
import { Globe, Loader2 } from 'lucide-react'

const languages = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'ru', label: 'Русский', flag: 'RU' },
  { code: 'tj', label: 'Тоҷикӣ', flag: 'TJ' },
]

const translations = {
  en: {
    title: 'Welcome back',
    description: 'Sign in to the Credit Guarantee Fund MIS',
    email: 'Email',
    password: 'Password',
    login: 'Sign In',
    loggingIn: 'Signing in...',
    noAccount: "Don't have an account?",
    signUp: 'Request Access',
    forgotPassword: 'Forgot password?',
    ministry: 'Ministry of Finance of the Republic of Tajikistan',
  },
  ru: {
    title: 'Добро пожаловать',
    description: 'Войдите в систему отслеживания кредитов ФРЧР',
    email: 'Электронная почта',
    password: 'Пароль',
    login: 'Войти',
    loggingIn: 'Вход...',
    noAccount: 'Нет аккаунта?',
    signUp: 'Запросить доступ',
    forgotPassword: 'Забыли пароль?',
    ministry: 'Министерство финансов Республики Таджикистан',
  },
  tj: {
    title: 'Хуш омадед',
    description: 'Ба системаи пайгирии қарзи ФТСК ворид шавед',
    email: 'Почтаи электронӣ',
    password: 'Рамз',
    login: 'Воридшавӣ',
    loggingIn: 'Воридшавӣ...',
    noAccount: 'Аккаунт надоред?',
    signUp: 'Дархости дастрасӣ',
    forgotPassword: 'Рамзро фаромӯш кардед?',
    ministry: 'Вазорати молияи Ҷумҳурии Тоҷикистон',
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
    <div className="flex min-h-svh">
      {/* Left panel - branding */}
      <div className="hidden flex-col justify-between bg-primary p-10 lg:flex lg:w-[480px]">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Emblem of Tajikistan" width={40} height={40} className="h-10 w-10 object-contain" />
          <div>
            <span className="text-base font-bold text-primary-foreground">Credit Guarantee Fund</span>
            <p className="text-[11px] text-primary-foreground/60">Management Information System</p>
          </div>
        </div>
        <div>
          <h2 className="text-balance text-3xl font-bold leading-tight text-primary-foreground">
            Credit Guarantee Fund
          </h2>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-primary-foreground/60">
            A comprehensive system for tracking and managing loan guarantees 
            to MSME borrowers across partner financial institutions.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/40">
          {t.ministry}
        </p>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 lg:hidden">
            <Image src="/logo.png" alt="Emblem of Tajikistan" width={32} height={32} className="h-8 w-8 object-contain" />
            <span className="text-sm font-bold text-foreground">Credit Guarantee Fund</span>
          </div>
          <div className="ml-auto">
            <Select value={language} onValueChange={(v) => setLanguage(v as 'en' | 'ru' | 'tj')}>
              <SelectTrigger className="h-9 w-28 border-border bg-card text-xs">
                <Globe className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
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
          </div>
        </div>

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center px-6 pb-10">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.title}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{t.description}</p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm font-medium">{t.email}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@bank.tj"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-card"
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">{t.password}</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs font-medium text-accent hover:underline"
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
                  className="h-11 bg-card"
                />
              </div>
              {error && (
                <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.loggingIn}
                  </>
                ) : (
                  t.login
                )}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              {t.noAccount}{' '}
              <Link href="/auth/sign-up" className="font-semibold text-accent hover:underline">
                {t.signUp}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
