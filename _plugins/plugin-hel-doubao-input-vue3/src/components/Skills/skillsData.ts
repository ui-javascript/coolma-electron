import type { Node } from 'slate-vue3/core';

export interface SkillCategory {
  id: string;
  label: string;
  icon: string;
  skills: Skill[];
}

export interface Skill {
  id: string;
  label: string;
  description: string;
  icon?: string;
  prompt: string;
  nodes: Node[];
}

// 预设技能模板
export const skillsData: SkillCategory[] = [
  {
    id: 'writing',
    label: '写作助手',
    icon: 'i-mdi-pencil',
    skills: [
      {
        id: 'article',
        label: '文章写作',
        description: '撰写各类文章',
        icon: 'i-mdi-file-document',
        prompt: '我需要你帮助撰写一篇关于{topic}的文章，要求结构清晰、内容丰富。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '我需要你帮助撰写一篇关于' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入主题]' },
              { text: '的文章，要求结构清晰、内容丰富。' },
            ]
          }
        ]
      },
      {
        id: 'outline',
        label: '大纲生成',
        description: '快速生成文章大纲',
        icon: 'i-mdi-format-list-bulleted',
        prompt: '为"{topic}"生成一个详细的大纲，包括引言、正文要点和结论。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '为"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入主题]' },
              { text: '"生成一个详细的大纲，包括引言、正文要点和结论。' },
            ]
          }
        ]
      },
      {
        id: 'rewrite',
        label: '文本润色',
        description: '优化现有文本',
        icon: 'i-mdi-auto-fix',
        prompt: '请帮我润色以下文本，使其更加流畅、专业：\n\n{content}',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '请帮我润色以下文本，使其更加流畅、专业：' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { text: '' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入需要润色的文本]' },
            ]
          }
        ]
      },
      {
        id: 'headline',
        label: '标题生成',
        description: '生成吸引人的标题',
        icon: 'i-mdi-format-title',
        prompt: '为文章"{topic}"生成5个吸引人的标题选项。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '为文章"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入文章主题]' },
              { text: '"生成5个吸引人的标题选项。' },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'coding',
    label: '编程开发',
    icon: 'i-mdi-code-tags',
    skills: [
      {
        id: 'code-review',
        label: '代码审查',
        description: '分析代码问题',
        icon: 'i-mdi-magnify-close',
        prompt: '请审查以下代码，指出潜在问题和优化建议：\n\n```{language}\n{code}\n```',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '请审查以下代码，指出潜在问题和优化建议：' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { text: '代码语言：' },
              { type: 'select-tag', children: [{ text: '' }], value: 'JavaScript', options: [
                { label: 'JavaScript', value: 'JavaScript' },
                { label: 'TypeScript', value: 'TypeScript' },
                { label: 'Python', value: 'Python' },
                { label: 'Java', value: 'Java' },
                { label: 'Go', value: 'Go' },
                { label: 'Rust', value: 'Rust' },
                { label: 'C++', value: 'C++' },
                { label: '其他', value: '其他' }
              ]},
            ]
          },
          {
            type: 'paragraph',
            children: [
              { type: 'input-tag', children: [{ text: '' }], label: '[粘贴代码]' },
            ]
          }
        ]
      },
      {
        id: 'code-explain',
        label: '代码解释',
        description: '解释代码功能',
        icon: 'i-mdi-help-circle',
        prompt: '请解释以下代码的功能和工作原理：\n\n```{language}\n{code}\n```',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '请解释以下代码的功能和工作原理：' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { type: 'input-tag', children: [{ text: '' }], label: '[粘贴代码]' },
            ]
          }
        ]
      },
      {
        id: 'algorithm',
        label: '算法设计',
        description: '设计算法解决方案',
        icon: 'i-mdi-sitemap',
        prompt: '请为"{problem}"设计一个高效的算法解决方案，包括时间复杂度和空间复杂度分析。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '请为"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入问题描述]' },
              { text: '"设计一个高效的算法解决方案，包括时间复杂度和空间复杂度分析。' },
            ]
          }
        ]
      },
      {
        id: 'debug',
        label: 'Bug 修复',
        description: '帮助定位和修复错误',
        icon: 'i-mdi-bug',
        prompt: '我遇到了以下错误，请帮我分析和修复：\n\n错误信息：{error}\n\n相关代码：\n```{language}\n{code}\n```',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '我遇到了以下错误，请帮我分析和修复：' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { text: '错误信息：' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入错误信息]' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { text: '相关代码：' },
              { type: 'input-tag', children: [{ text: '' }], label: '[粘贴相关代码]' },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'learning',
    label: '学习助手',
    icon: 'i-mdi-school',
    skills: [
      {
        id: 'summarize',
        label: '内容总结',
        description: '提炼核心要点',
        icon: 'i-mdi-text-short',
        prompt: '请总结以下内容的核心要点：\n\n{content}',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '请总结以下内容的核心要点：' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { type: 'input-tag', children: [{ text: '' }], label: '[输入需要总结的内容]' },
            ]
          }
        ]
      },
      {
        id: 'explain',
        label: '概念解释',
        description: '解释专业概念',
        icon: 'i-mdi-lightbulb',
        prompt: '请用通俗易懂的语言解释"{concept}"这个概念。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '请用通俗易懂的语言解释"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入概念名称]' },
              { text: '"这个概念。' },
            ]
          }
        ]
      },
      {
        id: 'quiz',
        label: '练习题生成',
        description: '生成学习练习题',
        icon: 'i-mdi-head-question',
        prompt: '为"{topic}"生成5道练习题，包含选择题、填空题和简答题。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '为"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入学习主题]' },
              { text: '"生成5道练习题，包含选择题、填空题和简答题。' },
            ]
          }
        ]
      },
      {
        id: 'translate',
        label: '翻译助手',
        description: '中英文互译',
        icon: 'i-mdi-translate',
        prompt: '将以下内容翻译成{toLanguage}：\n\n{content}',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '将以下内容翻译成' },
              { type: 'select-tag', children: [{ text: '' }], value: '英文', options: [
                { label: '英文', value: '英文' },
                { label: '中文', value: '中文' },
                { label: '日文', value: '日文' },
                { label: '韩文', value: '韩文' },
                { label: '法文', value: '法文' },
                { label: '德文', value: '德文' }
              ]},
              { text: '：' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { type: 'input-tag', children: [{ text: '' }], label: '[输入需要翻译的内容]' },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'work',
    label: '工作效率',
    icon: 'i-mdi-briefcase',
    skills: [
      {
        id: 'email',
        label: '邮件撰写',
        description: '专业邮件写作',
        icon: 'i-mdi-email',
        prompt: '帮我撰写一封{type}邮件，主题是"{subject}"，收件人是{recipient}。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '帮我撰写一封' },
              { type: 'select-tag', children: [{ text: '' }], value: '商务', options: [
                { label: '商务', value: '商务' },
                { label: '正式', value: '正式' },
                { label: '友好', value: '友好' },
                { label: '紧急', value: '紧急' }
              ]},
              { text: '邮件，主题是"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入邮件主题]' },
              { text: '"，收件人是' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入收件人]' },
              { text: '。' },
            ]
          }
        ]
      },
      {
        id: 'meeting',
        label: '会议纪要',
        description: '整理会议要点',
        icon: 'i-mdi-clipboard-text',
        prompt: '根据以下会议内容，整理一份会议纪要：\n\n{content}',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '根据以下会议内容，整理一份会议纪要：' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { type: 'input-tag', children: [{ text: '' }], label: '[输入会议记录内容]' },
            ]
          }
        ]
      },
      {
        id: 'plan',
        label: '计划制定',
        description: '制定执行计划',
        icon: 'i-mdi-calendar-check',
        prompt: '为"{goal}"制定一个详细的执行计划，包括时间节点和具体步骤。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '为"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入目标]' },
              { text: '"制定一个详细的执行计划，包括时间节点和具体步骤。' },
            ]
          }
        ]
      },
      {
        id: 'report',
        label: '报告撰写',
        description: '撰写工作报告',
        icon: 'i-mdi-file-chart',
        prompt: '帮我撰写一份{type}报告，主题是"{topic}"。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '帮我撰写一份' },
              { type: 'select-tag', children: [{ text: '' }], value: '周报', options: [
                { label: '周报', value: '周报' },
                { label: '月报', value: '月报' },
                { label: '季度报告', value: '季度报告' },
                { label: '年终总结', value: '年终总结' },
                { label: '项目报告', value: '项目报告' }
              ]},
              { text: '报告，主题是"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入报告主题]' },
              { text: '"。' },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'creative',
    label: '创意灵感',
    icon: 'i-mdi-lightbulb-on',
    skills: [
      {
        id: 'brainstorm',
        label: '头脑风暴',
        description: '生成创意想法',
        icon: 'i-mdi-head-lightbulb',
        prompt: '针对"{topic}"进行头脑风暴，列出10个创意想法。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '针对"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入主题]' },
              { text: '"进行头脑风暴，列出10个创意想法。' },
            ]
          }
        ]
      },
      {
        id: 'name-generator',
        label: '名称生成',
        description: '生成项目/产品名称',
        icon: 'i-mdi-tag',
        prompt: '为"{type}"生成10个有创意的名称，要求简洁、易记、有特色。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '为' },
              { type: 'select-tag', children: [{ text: '' }], value: '产品', options: [
                { label: '产品', value: '产品' },
                { label: '项目', value: '项目' },
                { label: '品牌', value: '品牌' },
                { label: '文章', value: '文章' },
                { label: '视频', value: '视频' }
              ]},
              { text: '生成10个有创意的名称，要求简洁、易记、有特色。' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { text: '关键词：' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入关键词]' },
            ]
          }
        ]
      },
      {
        id: 'story',
        label: '故事创作',
        description: '编写创意故事',
        icon: 'i-mdi-book-open',
        prompt: '创作一个关于"{theme}"的故事，要求情节曲折、人物鲜明。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '创作一个关于"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入故事主题]' },
              { text: '"的故事，要求情节曲折、人物鲜明。' },
            ]
          },
          {
            type: 'paragraph',
            children: [
              { text: '故事类型：' },
              { type: 'select-tag', children: [{ text: '' }], value: '科幻', options: [
                { label: '科幻', value: '科幻' },
                { label: '奇幻', value: '奇幻' },
                { label: '悬疑', value: '悬疑' },
                { label: '爱情', value: '爱情' },
                { label: '冒险', value: '冒险' }
              ]},
            ]
          }
        ]
      },
      {
        id: 'slogan',
        label: '广告语',
        description: '创作广告宣传语',
        icon: 'i-mdi-bullhorn',
        prompt: '为"{product}"创作10条广告语，要求简短有力、朗朗上口。',
        nodes: [
          {
            type: 'paragraph',
            children: [
              { text: '为"' },
              { type: 'input-tag', children: [{ text: '' }], label: '[输入产品/服务名称]' },
              { text: '"创作10条广告语，要求简短有力、朗朗上口。' },
            ]
          }
        ]
      }
    ]
  }
];

export default skillsData;
