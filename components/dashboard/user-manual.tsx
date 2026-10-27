'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Info, Search } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import { usePermissions } from '@/lib/contexts/permission-context'
import { getManualContent, searchManualTopics, type ManualTopic } from '@/lib/user-manual-content'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

type ManualLabels = ReturnType<typeof getManualContent>['ui']

function ManualArticle({ topic, ui, searching, canOpen }: { topic: ManualTopic; ui: ManualLabels; searching: boolean; canOpen: boolean }) {
  const uiText = useUiTranslation()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 border-b pb-6">
        <p className="text-sm font-medium text-primary">{topic.audience}</p>
        <h2 id="manual-topic-title" className="text-balance text-2xl font-semibold tracking-tight lg:text-3xl">{uiText(topic.title)}</h2>
        <p className="text-pretty leading-relaxed text-muted-foreground">{topic.summary}</p>
        {topic.link && canOpen && (
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link href={topic.link.href}>{ui.open}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
          </Button>
        )}
      </header>

      {topic.before.length > 0 && (
        <section aria-labelledby="manual-before-title" className="flex flex-col gap-3 rounded-xl bg-muted/60 p-5 text-foreground">
          <h3 id="manual-before-title" className="font-semibold">{ui.before}</h3>
          <ul className="flex flex-col gap-3">
            {topic.before.map(item => <li key={item} className="flex items-start gap-3 text-sm leading-relaxed"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span>{item}</span></li>)}
          </ul>
        </section>
      )}

      <section aria-labelledby="manual-steps-title" className="flex flex-col gap-5">
        <h3 id="manual-steps-title" className="text-lg font-semibold">{ui.steps}</h3>
        {topic.id === 'troubleshooting' ? (
          <Accordion key={String(searching)} type="multiple" defaultValue={searching ? topic.steps.map((_, i) => String(i)) : ['0']}>
            {topic.steps.map((step, index) => (
              <AccordionItem key={step.title} value={String(index)}>
                <AccordionTrigger className="text-left text-base">{uiText(step.title)}</AccordionTrigger>
                <AccordionContent><p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p></AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : topic.id === 'glossary' ? (
          <dl className="flex flex-col gap-6">
            {topic.steps.map(step => <div key={step.title} className="flex flex-col gap-2"><dt className="font-semibold">{uiText(step.title)}</dt><dd className="text-sm leading-relaxed text-muted-foreground">{step.text}</dd></div>)}
          </dl>
        ) : (
          <ol className="flex flex-col gap-7">
            {topic.steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-4">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-semibold text-primary">{index + 1}</span>
                <div className="flex min-w-0 flex-col gap-2 pt-1">
                  <h4 className="font-semibold">{uiText(step.title)}</h4>
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-2 border-y py-5" aria-labelledby="manual-result-title">
        <h3 id="manual-result-title" className="flex items-center gap-2 font-semibold"><CheckCircle2 aria-hidden="true" className="size-5 text-primary" />{ui.result}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{topic.result}</p>
      </section>
      <Alert role="note">
        <Info className="size-4" aria-hidden="true" />
        <AlertTitle>{ui.caution}</AlertTitle>
        <AlertDescription><p>{topic.caution}</p></AlertDescription>
      </Alert>
    </div>
  )
}

export function UserManual() {
  const uiText = useUiTranslation()

  const { locale } = useI18n()
  const { can } = usePermissions()
  const { ui, topics } = getManualContent(locale)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('getting-started')
  const articleRef = useRef<HTMLElement>(null)
  const matches = searchManualTopics(topics, query)
  const current = matches.find(topic => topic.id === selected) ?? matches[0]
  const currentIndex = matches.findIndex(topic => topic.id === current?.id)
  const searching = query.trim().length > 0

  function selectTopic(id: string) {
    setSelected(id)
    requestAnimationFrame(() => {
      articleRef.current?.focus({ preventScroll: true })
      articleRef.current?.scrollIntoView({ block: 'start' })
    })
  }

  function openQuickTopic(id: string) {
    setQuery('')
    selectTopic(id)
  }

  return (
    <div lang={locale === 'tj' ? 'tg' : locale} className="flex min-h-full flex-col bg-background font-sans text-foreground">
      <header className="flex flex-col gap-5 border-b bg-card px-5 py-7 text-card-foreground lg:px-8">
        <p className="text-sm font-medium tracking-wide text-primary">{ui.eyebrow}</p>
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div className="flex flex-col gap-2">
            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight"><BookOpen className="size-7 shrink-0 text-primary" aria-hidden="true" />{uiText(ui.title)}</h1>
            <p className="text-pretty leading-relaxed text-muted-foreground">{ui.subtitle}</p>
          </div>
          <div role="search" className="flex w-full flex-col gap-2 xl:max-w-sm">
            <label htmlFor="manual-search" className="flex items-center gap-2 text-sm font-medium"><Search className="size-4" aria-hidden="true" />{ui.search}</label>
            <Input id="manual-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={ui.placeholder} aria-controls="manual-topics manual-article" />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-5 py-6 lg:px-8">
        {!searching && (
          <section aria-labelledby="manual-quick-title" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1"><h2 id="manual-quick-title" className="font-semibold">{ui.quickTitle}</h2><p className="text-sm leading-relaxed text-muted-foreground">{ui.quickText}</p></div>
            <div className="grid gap-3 md:grid-cols-3">
              {['new-application', 'bank-submission', 'guarantee-reports'].map(id => {
                const topic = topics.find(item => item.id === id)!
                return <button type="button" key={id} onClick={() => openQuickTopic(id)} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 text-left text-card-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex flex-col gap-1"><span className="text-sm text-muted-foreground">{topic.audience}</span><span className="text-sm font-semibold">{uiText(topic.title)}</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-primary" /></button>
              })}
            </div>
          </section>
        )}

        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:gap-8">
          <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6" aria-label={ui.topics}>
            <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{searching ? ui.results : ui.topics}</h2><span role="status" aria-live="polite" className="text-sm tabular-nums text-muted-foreground">{matches.length} / {topics.length}</span></div>
            {searching && <Button variant="outline" size="sm" onClick={() => setQuery('')}>{ui.clear}</Button>}
            <nav id="manual-topics" aria-label={ui.topics} className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border bg-card p-2 text-card-foreground lg:max-h-[calc(100dvh-12rem)]">
              {matches.map(topic => <button type="button" key={topic.id} onClick={() => selectTopic(topic.id)} aria-current={current?.id === topic.id ? 'location' : undefined} className={cn('flex items-center justify-between gap-2 rounded-md px-3 py-3 text-left text-sm leading-relaxed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', current?.id === topic.id ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}><span>{uiText(topic.title)}</span>{current?.id === topic.id && <ChevronRight aria-hidden="true" className="size-4 shrink-0" />}</button>)}
              {matches.length === 0 && <p className="p-3 text-sm leading-relaxed text-muted-foreground">{ui.empty}</p>}
            </nav>
            <p className="hidden text-sm leading-relaxed text-muted-foreground lg:block">{ui.scope}</p>
          </aside>

          <article id="manual-article" ref={articleRef} tabIndex={-1} aria-labelledby={current ? 'manual-topic-title' : 'manual-empty-title'} className="flex min-w-0 scroll-mt-6 flex-col gap-8 rounded-xl border bg-card p-5 text-card-foreground outline-none md:p-7 xl:p-8">
            {current ? <>
              <ManualArticle key={`${locale}-${current.id}`} topic={current} ui={ui} searching={searching} canOpen={Boolean(current.link && can(current.link.resource, 'view'))} />
              <nav aria-label={ui.topics} className="flex flex-wrap justify-between gap-3 border-t pt-5">
                <Button variant="ghost" disabled={currentIndex <= 0} onClick={() => selectTopic(matches[currentIndex - 1].id)}><ArrowLeft data-icon="inline-start" aria-hidden="true" />{ui.previous}</Button>
                <Button variant="outline" disabled={currentIndex >= matches.length - 1} onClick={() => selectTopic(matches[currentIndex + 1].id)}>{ui.next}<ArrowRight data-icon="inline-end" aria-hidden="true" /></Button>
              </nav>
            </> : <div className="flex flex-col items-start gap-4 py-10"><Search className="size-7 text-muted-foreground" aria-hidden="true" /><h2 id="manual-empty-title" className="text-xl font-semibold">{ui.empty}</h2><p className="text-sm leading-relaxed text-muted-foreground">{ui.emptyText}</p><Button variant="outline" onClick={() => setQuery('')}>{ui.clear}</Button></div>}
            <footer className="flex flex-col gap-2 border-t pt-5"><h3 className="text-sm font-semibold">{ui.help}</h3><p className="text-sm leading-relaxed text-muted-foreground">{ui.helpText}</p></footer>
          </article>
        </div>
      </div>
    </div>
  )
}
