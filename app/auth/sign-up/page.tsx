'use client'

import React from "react"
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
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
    title: 'Request Access',
    description: 'Create an account to access the Credit Guarantee Fund MIS',
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    signUp: 'Create Account',
    signingUp: 'Creating account...',
    hasAccount: 'Already have an account?',
    login: 'Sign in',
    passwordMismatch: 'Passwords do not match',
    preferredLanguage: 'Preferred Language',
    ministry: 'Ministry of Finance of the Republic of Tajikistan',
  },
  ru: {
    title: 'Запросить доступ',
    description: 'Создайте аккаунт для доступа к системе ФРЧР',
    firstName: 'Имя',
    lastName: 'Фамилия',
    email: 'Электронная почта',
    password: 'Пароль',
    confirmPassword: 'Подтвердите пароль',
    signUp: 'Создать аккаунт',
    signingUp: 'Создание аккаунта...',
    hasAccount: 'Уже есть аккаунт?',
    login: 'Войти',
    passwordMismatch: 'Пароли не совпадают',
    preferredLanguage: 'Предпочитаемый язык',
    ministry: 'Министерство финансов Республики Таджикистан',
  },
  tj: {
    title: 'Дархости дастрасӣ',
    description: 'Барои дастрасӣ ба системаи ФТСК аккаунт созед',
    firstName: 'Ном',
    lastName: 'Насаб',
    email: 'Почтаи электронӣ',
    password: 'Рамз',
    confirmPassword: 'Тасдиқи рамз',
    signUp: 'Эҷоди аккаунт',
    signingUp: 'Эҷоди аккаунт...',
    hasAccount: 'Аллакай аккаунт доред?',
    login: 'Воридшавӣ',
    passwordMismatch: 'Рамзҳо мувофиқат намекунанд',
    preferredLanguage: 'Забони интихобшуда',
    ministry: 'Вазорати молияи Ҷумҳурии Тоҷикистон',
  },
}

export default function SignUpPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [language, setLanguage] = useState<'en' | 'ru' | 'tj'>('en')
  const router = useRouter()
  
  const t = translations[language]

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError(t.passwordMismatch)
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/dashboard`,
          data: {
            first_name: firstName,
            last_name: lastName,
            preferred_language: language,
          },
        },
      })
      if (error) throw error
      router.push('/auth/sign-up-success')
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
            Join the platform that connects partner banks with MSME borrowers 
            through guaranteed loan facilities across Tajikistan.
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

            <form onSubmit={handleSignUp} className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="firstName" className="text-sm font-medium">{t.firstName}</Label>
                  <Input
                    id="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="h-11 bg-card"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="lastName" className="text-sm font-medium">{t.lastName}</Label>
                  <Input
                    id="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="h-11 bg-card"
                  />
                </div>
              </div>
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
                <Label htmlFor="password" className="text-sm font-medium">{t.password}</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 bg-card"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">{t.confirmPassword}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 bg-card"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="preferredLanguage" className="text-sm font-medium">{t.preferredLanguage}</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as 'en' | 'ru' | 'tj')}>
                  <SelectTrigger className="h-11 bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    {t.signingUp}
                  </>
                ) : (
                  t.signUp
                )}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              {t.hasAccount}{' '}
              <Link href="/auth/login" className="font-semibold text-accent hover:underline">
                {t.login}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
