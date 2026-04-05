'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Globe, Loader2, CheckCircle2, Eye, EyeOff, Lock, AlertCircle } from 'lucide-react'

const languages = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'ru', label: 'Русский', flag: 'RU' },
  { code: 'tj', label: 'Тоҷикӣ', flag: 'TJ' },
]

const translations = {
  en: {
    title: 'Set New Password',
    description: 'Enter your new password below',
    newPassword: 'New Password',
    confirmPassword: 'Confirm Password',
    passwordPlaceholder: 'Enter new password',
    confirmPlaceholder: 'Confirm new password',
    submit: 'Update Password',
    submitting: 'Updating...',
    ministry: 'Ministry of Finance of the Republic of Tajikistan',
    successTitle: 'Password Updated',
    successMessage: 'Your password has been successfully updated. You can now sign in with your new password.',
    goToLogin: 'Go to Sign In',
    passwordMismatch: 'Passwords do not match',
    passwordTooShort: 'Password must be at least 8 characters',
    invalidLink: 'Invalid Reset Link',
    invalidLinkMessage: 'This password reset link is invalid or has expired. Please request a new one.',
    requestNewLink: 'Request New Link',
  },
  ru: {
    title: 'Установить новый пароль',
    description: 'Введите новый пароль ниже',
    newPassword: 'Новый пароль',
    confirmPassword: 'Подтвердите пароль',
    passwordPlaceholder: 'Введите новый пароль',
    confirmPlaceholder: 'Подтвердите пароль',
    submit: 'Обновить пароль',
    submitting: 'Обновление...',
    ministry: 'Министерство финансов Республики Таджикистан',
    successTitle: 'Пароль обновлён',
    successMessage: 'Ваш пароль успешно обновлён. Теперь вы можете войти с новым паролем.',
    goToLogin: 'Перейти к входу',
    passwordMismatch: 'Пароли не совпадают',
    passwordTooShort: 'Пароль должен быть не менее 8 символов',
    invalidLink: 'Недействительная ссылка',
    invalidLinkMessage: 'Ссылка для сброса пароля недействительна или истекла. Запросите новую.',
    requestNewLink: 'Запросить новую ссылку',
  },
  tj: {
    title: 'Рамзи нав гузоред',
    description: 'Рамзи навро дар поён ворид кунед',
    newPassword: 'Рамзи нав',
    confirmPassword: 'Тасдиқи рамз',
    passwordPlaceholder: 'Рамзи навро ворид кунед',
    confirmPlaceholder: 'Рамзро тасдиқ кунед',
    submit: 'Навсозии рамз',
    submitting: 'Навсозӣ...',
    ministry: 'Вазорати молияи Ҷумҳурии Тоҷикистон',
    successTitle: 'Рамз навсозӣ шуд',
    successMessage: 'Рамзи шумо бомуваффақият навсозӣ шуд. Акнун шумо метавонед бо рамзи нав ворид шавед.',
    goToLogin: 'Ба воридшавӣ гузаред',
    passwordMismatch: 'Рамзҳо мувофиқат намекунанд',
    passwordTooShort: 'Рамз бояд ҳадди ақал 8 аломат дошта бошад',
    invalidLink: 'Истиноди нодуруст',
    invalidLinkMessage: 'Истиноди барқарорсозии рамз нодуруст ё мӯҳлаташ гузаштааст. Истиноди навро дархост кунед.',
    requestNewLink: 'Истиноди нав дархост кунед',
  },
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null)
  const [language, setLanguage] = useState<'en' | 'ru' | 'tj'>('en')

  const t = translations[language]
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    // Check if we have a valid session from the reset link
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setIsValidSession(!!session)
    }
    checkSession()
  }, [supabase.auth])

  const validatePassword = (): string | null => {
    if (password.length < 8) {
      return t.passwordTooShort
    }
    if (password !== confirmPassword) {
      return t.passwordMismatch
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const validationError = validatePassword()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) {
        throw error
      }

      // Sign out after password update
      await supabase.auth.signOut()
      setIsSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
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
              {!isValidSession ? t.invalidLink : isSuccess ? t.successTitle : t.title}
            </CardTitle>
            <CardDescription className="text-slate-600">
              {!isValidSession ? '' : isSuccess ? '' : t.description}
            </CardDescription>
            <p className="text-xs text-muted-foreground">{t.ministry}</p>
          </div>
        </CardHeader>

        <CardContent>
          {!isValidSession ? (
            // Invalid or expired link
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4 rounded-lg bg-red-50 p-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
                <p className="text-sm text-slate-600">{t.invalidLinkMessage}</p>
              </div>
              
              <Link href="/auth/forgot-password" className="block">
                <Button className="w-full bg-teal-600 hover:bg-teal-700">
                  {t.requestNewLink}
                </Button>
              </Link>
            </div>
          ) : isSuccess ? (
            // Success state
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4 rounded-lg bg-teal-50 p-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
                  <CheckCircle2 className="h-8 w-8 text-teal-600" />
                </div>
                <p className="text-sm text-slate-600">{t.successMessage}</p>
              </div>
              
              <Link href="/auth/login" className="block">
                <Button className="w-full bg-teal-600 hover:bg-teal-700">
                  {t.goToLogin}
                </Button>
              </Link>
            </div>
          ) : (
            // Password reset form
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
                  {error}
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="password">{t.newPassword}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t.passwordPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t.confirmPassword}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder={t.confirmPlaceholder}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-teal-600 hover:bg-teal-700"
                disabled={isLoading || !password || !confirmPassword}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.submitting}
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    {t.submit}
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
