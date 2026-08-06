import { loadSettings } from './settings-store'
import Groq from 'groq-sdk'

let _client: Groq | null = null
let _clientKey: string | null = null

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

export interface CopilotResult {
  reply: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export function getGroqClient(): Groq | null {
  const settings = loadSettings()
  const key = settings.groqApiKey ?? process.env.GROQ_API_KEY
  if (!key) return null
  if (!_client || _clientKey !== key) {
    _client = new Groq({ apiKey: key })
    _clientKey = key
  }
  return _client
}

function getGroqModel(): string {
  const settings = loadSettings()
  return settings.aiModel ?? process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL
}

export async function askCopilotDetailed(systemPrompt: string, userMessage: string): Promise<CopilotResult> {
  const client = getGroqClient()
  if (!client) {
    return {
      reply: 'No AI API key configured. Add your Groq API key in Settings.',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
  }
  try {
    const completion = await client.chat.completions.create({
      model: getGroqModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    })
    return {
      reply: completion.choices[0]?.message?.content ?? 'No response from AI.',
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    }
  } catch (e) {
    return {
      reply: `AI error: ${(e as Error).message}`,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
  }
}

export async function askCopilot(systemPrompt: string, userMessage: string): Promise<string> {
  const result = await askCopilotDetailed(systemPrompt, userMessage)
  return result.reply
}

export const HANA_COPILOT_SYSTEM = `You are VynHana Copilot — a senior SAP HANA DBA and solutions architect embedded in the VynHana monitoring dashboard.

Your job is to give precise, production-safe, immediately actionable answers.

RESPONSE FORMAT:
- Brief explanation first (1–3 sentences)
- Then the SQL, command, or steps (use \`\`\`sql or \`\`\`bash code blocks)
- Then: what the result means, what to watch for
- End with: risks, prerequisites, or HANA Cloud limitations if relevant

RULES:
- Always include real SQL using M_* / SYS.* views when the question involves data
- Quote view/column names exactly as they appear in HANA (uppercase)
- For HANA Cloud free tier: note when a view or feature is unavailable (e.g., M_ALERTS, M_ALERT_DEFINITIONS, M_SYSTEM_REPLICATION_SITES are not available on free tier)
- Do not guess — if unsure, provide the investigative SQL to find out
- When a live system is connected (context injected below), tailor the answer to that version

DOMAINS:
- Memory: column store (M_CS_TABLES), heap (M_HEAP_MEMORY), INSTANCE_TOTAL_MEMORY_USED_SIZE, unload/reload
- Performance: M_SQL_PLAN_CACHE, M_EXPENSIVE_STATEMENTS, delta merge, statistics server
- Connections: pool saturation, "No Connection Available", M_CONNECTIONS
- Replication: HSR via M_SERVICE_REPLICATION, log shipping lag, takeover/failover procedure
- Backup & Recovery: M_BACKUP_CATALOG, M_BACKUP_CATALOG_FILES, BACKINT, point-in-time recovery
- Security: users/roles/privileges (SYS.USERS, SYS.ROLES), audit policies, HANA Cloud identity federation
- MDC: system DB vs tenant DB queries, cross-tenant monitoring via SYS_DATABASES.M_*
- Slow queries: bind sensitivity, plan cache cold start after restart, EXPLAIN PLAN, table statistics
- HANA Cloud specifics: BTP free tier 30 GB limit, SAP HANA Cloud Central, managed backups, scale-up`
