<script setup lang="ts">
import {computed} from "vue";
import type {PlacementChoice,LabFolder} from "./model.js";
const props=defineProps<{rows:PlacementChoice[];folders:LabFolder[];names:Map<string,string>;alreadyAdded:boolean}>();
defineEmits<{choose:[key:string,target:string]}>();
const name=(id:string)=>props.names.get(id)??id;
const suggestion=(row:PlacementChoice)=>row.suggestedTarget==="new"?`新建「${row.folderName}」文件夹`:`加入「${props.folders.find(f=>f.id===row.suggestedTarget)?.name??row.name}」`;
const folderCount=(row:PlacementChoice)=>props.folders.find(f=>f.id===row.suggestedTarget)?.apps.length??0;
const summary=computed(()=>({total:props.rows.reduce((n,r)=>n+r.ids.length,0),direct:props.rows.filter(r=>r.target==='desktop').reduce((n,r)=>n+r.ids.length,0),created:props.rows.filter(r=>r.target==='new').length,joined:props.rows.filter(r=>!['desktop','new'].includes(r.target)).reduce((n,r)=>n+r.ids.length,0)}));
</script>
<template>
  <div class="placement-preview">
    <p class="subtle">{{ alreadyAdded?'应用已添加。选择末尾会保留当前追加位置；建议方案只整理尚未手动移动的新增图标。':'检查所选应用的放置方式。确认前不改动启动台，已有应用的位置保持不变。' }}</p>
    <div v-if="!rows.length" class="empty">本批已无待处理应用，可以关闭预览。</div>
    <article v-for="(row,index) in rows" :key="row.key" class="placement-card">
      <header class="placement-heading"><b :id="`placement-title-${index}`">{{ row.name }}</b><small>{{ row.ids.length }} 个应用</small></header>
      <p class="placement-members">{{ row.ids.slice(0,3).map(name).join(' · ') }}</p>
      <details v-if="row.ids.length>3"><summary>查看全部 {{ row.ids.length }} 个应用</summary><ul><li v-for="id in row.ids" :key="id">{{ name(id) }}</li></ul></details>
      <div v-if="row.suggestedTarget!=='desktop'" class="placement-options" role="radiogroup" :aria-labelledby="`placement-title-${index}`">
        <label class="placement-option" :class="{chosen:row.target==='desktop'}"><input type="radio" :name="`placement-${index}`" :checked="row.target==='desktop'" @change="$emit('choose',row.key,'desktop')"><span><b>启动台末尾</b><small>{{ alreadyAdded?'保持当前追加位置，不重复移动':'每个应用直接展示' }}</small></span></label>
        <label class="placement-option" :class="{chosen:row.target===row.suggestedTarget}"><input type="radio" :name="`placement-${index}`" :checked="row.target===row.suggestedTarget" @change="$emit('choose',row.key,row.suggestedTarget)"><span><b>{{ suggestion(row) }} <em>建议</em></b><small>{{ row.suggestedTarget==='new'?`根据来源目录，将 ${row.ids.length} 个应用放在一起`:`原有 ${folderCount(row)} 个，加入后 ${folderCount(row)+row.ids.length} 个应用` }}</small></span></label>
      </div>
      <div v-else class="placement-direct">{{ alreadyAdded?'保持当前在启动台末尾的位置':'将放到启动台末尾' }}<small>没有需要合并的分组，不创建文件夹。</small></div>
    </article>
    <div v-if="rows.length" class="placement-summary"><b>共 {{ summary.total }} 个应用</b><span>{{ summary.direct }} 个直接展示</span><span>新建 {{ summary.created }} 个文件夹</span><span>{{ summary.joined }} 个加入已有文件夹</span></div>
  </div>
</template>
