'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check for existing session
    checkSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', session.access_token);
          // Also set cookie for middleware
          document.cookie = `auth_token=${session.access_token}; path=/; max-age=86400`;
        }
      } else {
        setUser(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          // Remove cookie
          document.cookie = 'auth_token=; path=/; max-age=0';
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', session.access_token);
          // Also set cookie for middleware
          document.cookie = `auth_token=${session.access_token}; path=/; max-age=86400`;
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.session) {
        setUser(data.user);
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', data.session.access_token);
          // Also set cookie for middleware
          document.cookie = `auth_token=${data.session.access_token}; path=/; max-age=86400`;
        }
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const signUp = async (email, password, metadata = {}) => {
    try {
      // Get the current origin for email redirect
      const redirectTo = typeof window !== 'undefined'
        ? `${window.location.origin}/`
        : undefined;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            username: metadata.username,
            gender: metadata.gender,
            dob: metadata.dob,
            photo_url: metadata.photo_url,
          },
        },
      });

      if (error) throw error;

      // If session exists, user is auto-confirmed and logged in
      if (data.session) {
        setUser(data.user);
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', data.session.access_token);
          // Also set cookie for middleware
          document.cookie = `auth_token=${data.session.access_token}; path=/; max-age=86400`;
        }
        return { success: true };
      }

      // If no session but user exists, email confirmation is required
      // However, if auto-confirm is enabled in Supabase, this shouldn't happen
      if (data.user) {
        // Try to get session after a brief delay (in case of async confirmation)
        // For auto-confirm setups, this is usually not needed
        return { success: true, requiresConfirmation: true, user: data.user };
      }

      return { success: false, error: 'Signup failed - no user created' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        // Remove cookie
        document.cookie = 'auth_token=; path=/; max-age=0';
      }
      router.refresh();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

