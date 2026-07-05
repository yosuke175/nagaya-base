import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export interface AuthProfile {
  displayName: string
  role: string
  avatar: string | null
  roomNo: number | null
}

/** 'disabled' = Supabase not configured → no-login local dev mode. */
export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in'

export interface Auth {
  status: AuthStatus
  userId: string | null
  email: string | null
  isAnonymous: boolean
  profile: AuthProfile | null
  /** ゲスト即入場（匿名）。ロールはトリガーで guest。 */
  signInAsGuest: () => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  /** 新規登録（メール確認後にログイン可能）。ロールはトリガーで user。 */
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export function useAuth(): Auth {
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'disabled')
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [profile, setProfile] = useState<AuthProfile | null>(null)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let cancelled = false

    const applySession = async (session: Session | null) => {
      if (cancelled) return
      if (!session) {
        setStatus('signed-out')
        setUserId(null)
        setEmail(null)
        setProfile(null)
        return
      }
      setStatus('signed-in')
      setUserId(session.user.id)
      setEmail(session.user.email ?? null)
      setIsAnonymous(session.user.is_anonymous ?? false)
      // Profile row is auto-created by the signup trigger
      // (匿名→guest / メール登録→user、20260704020000_auth_roles.sql)
      const { data } = await client
        .from('profiles')
        .select('display_name, role, avatar, room_no')
        .eq('id', session.user.id)
        .single()
      if (!cancelled && data) {
        setProfile({
          displayName: data.display_name,
          role: data.role,
          avatar: data.avatar ?? null,
          roomNo: data.room_no ?? null,
        })
      }
    }

    void client.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      void applySession(session)
    })
    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  return {
    status,
    userId,
    email,
    isAnonymous,
    profile,
    async signInAsGuest() {
      if (!supabase) return { error: 'Supabase が設定されていません' }
      const { error } = await supabase.auth.signInAnonymously()
      return { error: error ? error.message : null }
    },
    async signInWithMagicLink(target: string) {
      if (!supabase) return { error: 'Supabase が設定されていません' }
      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: { emailRedirectTo: window.location.origin },
      })
      return { error: error ? error.message : null }
    },
    async signInWithPassword(target: string, password: string) {
      if (!supabase) return { error: 'Supabase が設定されていません' }
      const { error } = await supabase.auth.signInWithPassword({ email: target, password })
      return { error: error ? error.message : null }
    },
    async signUpWithPassword(target: string, password: string) {
      if (!supabase) return { error: 'Supabase が設定されていません' }
      const { error } = await supabase.auth.signUp({
        email: target,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      return { error: error ? error.message : null }
    },
    async signOut() {
      await supabase?.auth.signOut()
    },
  }
}
