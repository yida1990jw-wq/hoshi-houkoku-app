// スタッフ(admin/overseer)をメール招待で追加するEdge Function。
// 呼び出し元が管理者(staff.role = 'admin')であることを本人のJWTで確認したうえで、
// service-role権限でauth.admin.inviteUserByEmail()を実行し、staffテーブルに行を追加する。
// クライアント(anonキー)側からは auth.users への書き込みができないため、この処理だけはEdge Function化が必要。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// GitHub Pagesの本番オリジンとローカル開発サーバーのみ許可する
const ALLOWED_ORIGINS = new Set(['https://yida1990jw-wq.github.io', 'http://localhost:5174', 'http://localhost:5173'])

function corsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://yida1990jw-wq.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  try {
    const { email, display_name, role } = await req.json()
    if (!email || !display_name || !role) return json({ error: '入力が不足しています' }, 400)
    if (role !== 'admin' && role !== 'overseer') return json({ error: '不正なroleです' }, 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: '認証が必要です' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 呼び出し元本人のJWTでクライアントを作り、is_admin相当をRLS越しに確認する
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: '認証エラー' }, 401)

    const { data: callerStaff } = await callerClient.from('staff').select('role').eq('user_id', user.id).single()
    if (callerStaff?.role !== 'admin') return json({ error: '管理者権限が必要です' }, 403)

    // ここから先はservice-role権限で実行
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email)
    if (inviteError || !invited.user) return json({ error: inviteError?.message ?? '招待に失敗しました' }, 400)

    const { error: insertError } = await adminClient
      .from('staff')
      .insert({ user_id: invited.user.id, role, display_name, email })
    if (insertError) return json({ error: insertError.message }, 400)

    return json({ ok: true }, 200)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '不明なエラーが発生しました' }, 500)
  }
})
