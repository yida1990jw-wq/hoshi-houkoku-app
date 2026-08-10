import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が設定されていません。.env.local を作成してください。',
  )
}

// テーブル結合クエリを types/domain.ts の手書き型 + .returns<T>() で扱うため、
// supabase-js の Database ジェネリックはあえて使わない(PostgREFT select文字列パーサーが
// 未定義の Relationships を推論できず never 型になってしまうため)。
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
