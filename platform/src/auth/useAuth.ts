import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export interface AuthProfile {
  displayName: string
  role: string
}

/** 'disabled' = Supabase not configured → no-login local dev mode. */
export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in'

export interface Auth {
  status: AuthStatus
  email: string | null
  profile: AuthProfile | null
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export function useAuth(): Auth {
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'disabled')
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<AuthProfile | null>(null)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let cancelled = false

    const applySession = async (session: Session | null) => {
      if (cancelled) return
      if (!session) {
        setStatus('signed-out')
        setEmail(null)
        setProfile(null)
        return
      }
      setStatus('signed-in')
      setEmail(session.user.email ?? null)
      // Profile row is auto-created by the signup trigger (initial role: guest)
      const { data } = await client
        .from('profiles')
        .select('display_name, role')
        .eq('id', session.user.id)
        .single()
      if (!cancelled && data) {
        setProfile({ displayName: data.display_name, role: data.role })
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
    email,
    profile,
    async signInWithMagicLink(target: string) {
      if (!supabase) return { error: 'Supabase が設定されていません' }
      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: { emailRedirectTo: window.location.origin },
      })
      return { error: error ? error.message : null }
    },
    async signOut() {
      await supabase?.auth.signOut()
    },
  }
}
