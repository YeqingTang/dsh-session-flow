// lib/timeline.js — 从解析后的会话事件派生「信息流」视图：
//   回合(Turn) → 步骤(Step) → 工具调用(ToolCall) → 产物(Artifact)
// 供 M3 折叠详情页与 M5 摘要引擎共同消费。
import { extractPaths, parseSession } from './archive.js'

/** 子代理工具结果中的会话 ID（"started subagent <uuid>"）。 */
const SUBAGENT_ID_RE = /started subagent\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

/**
 * 从 tool/result 的文本内容里截取预览。
 * 文本可能直接是顶层 text 块，也可能嵌套在 tool-result 块里
 * （content[0].content[0].text），递归提取所有 text 字段。
 */
export function resultTextOf(resultEvent) {
  const blocks = resultEvent && resultEvent.data && resultEvent.data.message && resultEvent.data.message.content
  if (!Array.isArray(blocks)) return ''
  const texts = []
  const walk = (b) => {
    if (b === null || typeof b !== 'object') return
    if (typeof b.text === 'string' && b.text.length > 0) texts.push(b.text)
    if (Array.isArray(b.content)) {
      for (const c of b.content) walk(c)
    }
  }
  for (const b of blocks) walk(b)
  return texts.join('\n').trim()
}

const preview = (text, max = 400) => {
  const t = String(text || '')
  return t.length > max ? t.slice(0, max) + '…' : t
}

/** 事件文本内容（user/assistant 消息的 text 块拼接预览）。 */
export function contentPreviewOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .map((b) => {
      if (b && b.type === 'text' && typeof b.text === 'string') return b.text
      if (b && b.type === 'reasoning' && typeof b.text === 'string') return '[思考] ' + b.text
      if (b && b.type === 'tool-result') return '[工具结果]'
      return ''
    })
    .join('\n')
    .trim()
}

/** 提取 assistant 消息中的思考块（reasoning）全文。 */
export function thinkingTextOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b && b.type === 'reasoning' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/** 提取 assistant 消息中的正文文本块（text，不含思考）——即「最终结论」内容。 */
export function textTextOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

/**
 * 从解析结果派生时间线。
 * @param {{ header, title, events }} parsed - parseSession 的输出。
 * @returns {{ turns, artifacts, summary }} turns 按顺序；artifacts 为全局产物路径集合。
 */
export function deriveTimeline(parsed) {
  const { events } = parsed
  const turns = []
  const turnMap = new Map()
  let currentStep = null // { step, startTime, endTime, toolCalls }
  let currentTurn = null

  const ensureTurn = (turnNo) => {
    let t = turnMap.get(turnNo)
    if (t === undefined) {
      t = { turn: turnNo, startTime: null, endTime: null, userMessages: [], injectedMessages: [], assistantMessages: [], steps: [], items: [] }
      turnMap.set(turnNo, t)
      turns.push(t)
    }
    return t
  }

  for (const ev of events) {
    switch (ev.type) {
      case 'turn/start': {
        currentTurn = ensureTurn(ev.data && ev.data.turn)
        currentTurn.startTime = currentTurn.startTime ?? ev.time
        break
      }
      case 'turn/end': {
        // 记录回合闭合时间：未收到 turn/end 的回合保持 endTime=null → 运行中信号。
        if (currentTurn && currentTurn.turn === (ev.data && ev.data.turn)) currentTurn.endTime = ev.time
        else {
          const t = turnMap.get(ev.data && ev.data.turn)
          if (t) t.endTime = ev.time
        }
        break
      }
      case 'step/start': {
        currentTurn = currentTurn || ensureTurn(ev.data && ev.data.turn)
        const stepNo = ev.data && ev.data.step
        currentStep = { step: stepNo, startTime: ev.time, endTime: null, toolCalls: [] }
        currentTurn.steps.push(currentStep)
        // 时间序：步骤头（渲染时在所属工具调用前显示）。
        currentTurn.items.push({ kind: 'step', seq: ev.seq, time: ev.time, step: stepNo })
        break
      }
      case 'step/end': {
        if (currentStep && currentStep.step === (ev.data && ev.data.step)) currentStep.endTime = ev.time
        break
      }
      case 'user/message': {
        currentTurn = currentTurn || ensureTurn(ev.data && ev.data.turn)
        const text = contentPreviewOf(ev.data && ev.data.content)
        // 来源分类：只有 source.kind === 'user' 才是真正的用户发言；
        // plugin / goal / skill-catalog 等是智能体/插件注入的信息，单独归类。
        const sourceKind = ev.data && ev.data.source ? String(ev.data.source.kind || '') : ''
        const isInjected = sourceKind !== '' && sourceKind !== 'user'
        const entry = { seq: ev.seq, time: ev.time, text, preview: preview(text), sourceKind: sourceKind || null }
        if (isInjected) currentTurn.injectedMessages.push(entry)
        else currentTurn.userMessages.push(entry)
        // 时间序：用户发言（kind: user）或注入信息（kind: inject，保持真实位置）。
        currentTurn.items.push({ kind: isInjected ? 'inject' : 'user', ...entry })
        break
      }
      case 'assistant/message': {
        currentTurn = currentTurn || ensureTurn(ev.data && ev.data.turn)
        const content = ev.data && ev.data.message && ev.data.message.content
        const thinking = thinkingTextOf(content)
        const text = textTextOf(content)
        currentTurn.assistantMessages.push({
          seq: ev.seq, time: ev.time,
          turn: ev.data && ev.data.turn, step: ev.data && ev.data.step,
          thinking, thinkingPreview: preview(thinking, 800),
          text, preview: preview(text, 1200),
          hasThinking: thinking.length > 0,
          hasText: text.length > 0,
        })
        // 时间序：助手消息（思考 + 正文结论，与工具调用真实交织）。
        currentTurn.items.push({
          kind: 'assistant', seq: ev.seq, time: ev.time,
          thinking, thinkingPreview: preview(thinking, 800),
          text, preview: preview(text, 1200),
          hasThinking: thinking.length > 0,
          hasText: text.length > 0,
        })
        break
      }
      case 'tool/call': {
        const d = ev.data || {}
        currentTurn = currentTurn || ensureTurn(d.turn)
        let step = currentStep
        if (!step || step.step !== d.step) {
          step = currentTurn.steps.find((s) => s.step === d.step) || null
          if (step === null && currentTurn.steps.length > 0) step = currentTurn.steps[currentTurn.steps.length - 1]
        }
        if (step === null) {
          step = { step: d.step, startTime: ev.time, endTime: null, toolCalls: [] }
          currentTurn.steps.push(step)
          currentStep = step
        }
        step.toolCalls.push({
          seq: ev.seq, time: ev.time,
          callId: d.callId, name: d.name,
          argumentsText: String(d.arguments || ''),
          argumentsPreview: preview(String(d.arguments || ''), 300),
          resultTime: null, isError: null, resultText: '', resultPreview: '',
          durationMs: null,
          artifacts: [...extractPaths(d.name, d.arguments)],
        })
        // 时间序：工具调用行（引用 step.toolCalls 里的完整对象，渲染时取用）。
        currentTurn.items.push({
          kind: 'tool', seq: ev.seq, time: ev.time, step: d.step,
          call: step.toolCalls[step.toolCalls.length - 1],
        })
        break
      }
      case 'tool/result': {
        const d = ev.data || {}
        const callId = d.message && d.message.source && d.message.source.callId
        if (callId) {
          // 在当前回合内找最近的匹配工具调用（callId 或 seq 回链）。
          let target = null
          const targets = (currentTurn && currentTurn.steps) || []
          for (const step of targets) {
            for (const tc of step.toolCalls) {
              if (tc.callId === callId) { target = tc; break }
            }
            if (target) break
          }
          if (!target) {
            // 兜底：全量扫描已见调用。
            outer:
            for (const t of turns) {
              for (const step of t.steps) {
                for (const tc of step.toolCalls) {
                  if (tc.callId === callId) { target = tc; break outer }
                }
              }
            }
          }
          if (target) {
            target.resultTime = ev.time
            target.resultText = resultTextOf(ev)
            target.resultPreview = preview(target.resultText, 400)
            target.isError = Array.isArray(d.message && d.message.content)
              ? d.message.content.some((b) => b && b.isError === true)
              : false
            target.durationMs = target.resultTime !== null && target.time !== null ? target.resultTime - target.time : null
            // 子代理工具：结果文本 "started subagent <uuid>" → 关联子代理会话 ID，
            // 前端可一键跳转查看该子代理的实际执行内容（而非只显示这行摘要）。
            // 仅对子代理类工具名提取，避免普通工具输出里的同文本误匹配。
            if (/^subagent/i.test(target.name)) {
              const m = SUBAGENT_ID_RE.exec(target.resultText)
              if (m) target.childSessionId = m[1]
            }
          }
        }
        break
      }
      default:
        break
    }
  }

  for (const t of turns) {
    // 回合闭合时间优先取 turn/end 事件；未收到 turn/end 时回退到「最后完成的步骤」
    // （step/end 全部出现 ≈ 回合完成；若步骤也未闭合则保持 null → 运行中信号）。
    if (t.endTime === null) {
      t.endTime = t.steps.reduce((acc, s) => (s.endTime !== null && s.endTime > acc ? s.endTime : acc), t.startTime)
    }
  }

  const artifacts = []
  const seenArtifacts = new Set()
  for (const t of turns) {
    for (const step of t.steps) {
      for (const tc of step.toolCalls) {
        for (const p of tc.artifacts || []) {
          if (!seenArtifacts.has(p)) {
            seenArtifacts.add(p)
            artifacts.push({ path: p, firstSeen: { turn: t.turn, step: step.step, callId: tc.callId } })
          }
        }
      }
    }
  }

  return { turns, artifacts }
}
