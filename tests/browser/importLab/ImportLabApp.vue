<script setup lang="ts">
import {computed,ref,watch,nextTick,onUpdated,onUnmounted} from "vue";
import PlacementPreview from "./PlacementPreview.vue";
import {catalogFor,installBatches,filteredEntries} from "./fixtures.js";
import {freshState,decodeLabState,placedIds,importPlan,startLab,scanLab,record,removeApp,moveApp,dissolveFolder,manualCandidates,placementPreview,applyPlacementPreview,type PlacementChoice,type LabState,type LabFolder} from "./model.js";
const storageKey="lumeria.import-lab.generic.v1";
const error=ref("");
function load():LabState{try{const raw=localStorage.getItem(storageKey);return raw?decodeLabState(raw):freshState();}catch(e){error.value=`无法恢复实验：${String(e)}。可点击重置重新开始。`;return freshState();}}
const state=ref(load()),step=ref(1),query=ref(""),openFolder=ref<string|null>(null),selected=ref<string|null>(null),panel=ref<"recent"|"restore"|null>(null),checked=ref<string[]>([]),newName=ref(""),moveTarget=ref("desktop"),explain=ref(true);
const shortcut=ref("Alt + Space"),mode=ref("fullscreen"),login=ref(false),feedback=ref("");
watch(()=>JSON.stringify(state.value.sources),()=>{undo.value=null;});
let feedbackTimer:ReturnType<typeof setTimeout>|undefined;
const undo=ref<{raw:string;revision:number}|null>(null);
watch(state,()=>{try{localStorage.setItem(storageKey,JSON.stringify(state.value));}catch(e){error.value=`实验数据未能保存：${String(e)}`;}},{deep:true,flush:"sync"});
const catalog=computed(()=>catalogFor(state.value.installed)),names=computed(()=>new Map(catalog.value.map(app=>[app.id,app.name])));
const name=(id:string)=>names.value.get(id)??id;
const folders=computed(()=>state.value.items.filter((item):item is LabFolder=>item.kind==="folder"));
const folder=computed(()=>folders.value.find(f=>f.id===openFolder.value));
const selectedFolder=computed(()=>folders.value.find(f=>f.id===selected.value));
const selectedApp=computed(()=>selected.value&&placedIds(state.value).includes(selected.value)?selected.value:null);
const preview=computed(()=>importPlan({...state.value,items:[]}));
const previewCount=computed(()=>preview.value.decisions.filter(row=>row.reason==="new").length);
const manualRows=computed(()=>manualCandidates(state.value));
const manualStep=ref(1),manualSearch=ref(""),placements=ref<PlacementChoice[]>([]),offered=ref<string[]>([]),previewStamp=ref(""),manualError=ref("");
const statusLabels={new:"新发现",recent:"已自动添加，待整理",hidden:"已移除，可重新添加",deferred:"此前暂不添加"};
const filteredManualRows=computed(()=>manualRows.value.filter(r=>r.name.toLowerCase().includes(manualSearch.value.toLowerCase())));
function manualStamp(){return JSON.stringify([state.value.items,state.value.sources,state.value.hidden,state.value.excluded,state.value.recent,state.value.installed,state.value.deferred,state.value.offline]);}
function buildPreview(preserve=true){
  const ids=panel.value==="recent"?state.value.recent:checked.value;
  const previous=placements.value;
  placements.value=placementPreview(state.value,ids).map(row=>{
    const old=preserve?previous.find(r=>r.key===row.key&&r.suggestedTarget===row.suggestedTarget&&r.ids.join()===row.ids.join()):undefined;
    return old?{...row,target:old.target}:row;
  });
  previewStamp.value=manualStamp();manualError.value="";
}
function nextManual(){buildPreview();manualStep.value=2;}
function confirmPlacement(){
  if(previewStamp.value!==manualStamp()){buildPreview(false);manualError.value="布局或来源已变化，已更新预览，请检查后再次确认。";return;}
  const raw=JSON.stringify(state.value);
  try{applyPlacementPreview(state.value,placements.value,panel.value==="restore"?offered.value:[]);undo.value={raw,revision:state.value.revision};panel.value=null;toast("已按所选方式放置应用，可以撤销。");}catch(e){manualError.value=String(e);}
}
const visibleItems=computed(()=>state.value.items.filter(item=>!query.value||nameOrFolder(item).toLowerCase().includes(query.value.toLowerCase())||(item.kind==="folder"&&item.apps.some(id=>name(id).toLowerCase().includes(query.value.toLowerCase())))));
function nameOrFolder(item:LabState["items"][number]){return item.kind==="folder"?item.name:name(item.id);}
const reasonLabels={existing:"已存在 · 保留位置",hidden:"已移除 · 不再自动加入",excluded:"已排除",new:"待加入",'source-disabled':"来源未启用"};
const lastPlan=ref(importPlan(state.value));
function toast(message:string){feedback.value=message;clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>feedback.value="",4500);}
function change(action:()=>void){undo.value=null;action();}
function reset(){change(()=>{state.value=freshState();step.value=1;panel.value=null;openFolder.value=null;selected.value=null;query.value="";error.value="";shortcut.value="Alt + Space";mode.value="fullscreen";login.value=false;lastPlan.value=importPlan(state.value);});}
function start(){change(()=>{lastPlan.value=preview.value;startLab(state.value);toast("初始布局已生成。试试改名、移动或移除，再模拟安装新应用。");});}
function install(id:string){if(state.value.installed.includes(id))return;change(()=>{state.value.installed.push(id);record(state.value,`模拟安装：${installBatches[id as keyof typeof installBatches].label}。尚未扫描。`);toast("模拟安装完成，点击「自动扫描」发现新入口。");});}
function scan(){change(()=>{lastPlan.value=scanLab(state.value);toast(state.value.offline?"来源暂时不可访问，布局保持不变。":lastPlan.value.decisions.some(r=>r.reason==="new")?"扫描完成，新增应用已追加。":"扫描完成，无新增。已移除的应用不会带回。");});}
function inspect(id:string){selected.value=id;newName.value=folders.value.find(f=>f.id===id)?.name??"";moveTarget.value="desktop";}
function toggleVisible(){change(()=>{state.value.visible=!state.value.visible;record(state.value,state.value.visible?"打开启动台：展示尚未关闭的新增提示。":"启动台已隐藏：扫描只记录结果，不拉起窗口。");});}
function restart(){try{const raw=localStorage.getItem(storageKey);if(!raw)throw new Error("没有可恢复数据");state.value=decodeLabState(raw);state.value.visible=true;panel.value=null;selected.value=null;openFolder.value=null;undo.value=null;record(state.value,"模拟重启：从实验存储恢复布局、隐藏记录和提示状态。");toast("重启完成，已恢复实验数据。");}catch(e){error.value=String(e);}}
function undoArrange(){if(!undo.value||undo.value.revision!==state.value.revision){toast("布局已有后续变化，不能用旧快照覆盖。");return;}state.value=decodeLabState(undo.value.raw);record(state.value,"已撤销本次新增整理。");undo.value=null;}
function openPanel(value:"recent"|"restore"){
  panel.value=value;checked.value=[];
  placements.value=[];
  if(value==="recent"){state.value.notice=false;buildPreview(false);}
  else {manualStep.value=1;manualSearch.value="";manualError.value="";offered.value=manualRows.value.map(r=>r.id);checked.value=manualRows.value.filter(r=>r.status==="new"||r.status==="recent").map(r=>r.id);}
}
function rename(){const f=selectedFolder.value,text=newName.value.trim().slice(0,32);if(!f||!text)return;change(()=>{f.name=text;record(state.value,`文件夹改名为「${text}」，扫描不会覆盖名称。`);});}
function remove(exclude=false){if(!selectedApp.value)return;change(()=>{removeApp(state.value,selectedApp.value!,exclude);selected.value=null;});toast(exclude?"已排除。可在手动扫描中取消排除。":"已移除，自动扫描不会重新添加。");}
function move(){if(!selectedApp.value)return;change(()=>moveApp(state.value,selectedApp.value!,moveTarget.value));toast("位置已更新，后续整理尊重这次移动。");}
function dissolve(){if(!selectedFolder.value)return;change(()=>{dissolveFolder(state.value,selectedFolder.value!.id);selected.value=null;openFolder.value=null;});toast("文件夹已解散，扫描不会重新收拢旧图标。");}
function manualFolder(){const text=newName.value.trim().slice(0,32);if(!selectedApp.value||!text)return;change(()=>{const f:LabFolder={kind:"folder",id:`folder-${state.value.nextId++}`,name:text,apps:[],groupKey:null};const id=selectedApp.value!;moveApp(state.value,id,"desktop");state.value.items=state.value.items.filter(item=>!(item.kind==="app"&&item.id===id));f.apps=[id];state.value.items.push(f);record(state.value,`已创建用户文件夹「${text}」。`);});toast("已建立用户文件夹，不会按同名目录自动关联。");}
function unexclude(id:string){change(()=>{state.value.excluded=state.value.excluded.filter(x=>x!==id);record(state.value,"已取消排除：仍保持移除状态，等待手动重新添加。");});}
const dialog=ref<HTMLElement|null>(null);let previousFocus:HTMLElement|null=null;
watch(panel,async value=>{if(value){previousFocus=document.activeElement as HTMLElement;await nextTick();dialog.value?.focus();}else previousFocus?.focus();});
onUpdated(()=>{if(panel.value&&dialog.value&&!dialog.value.contains(document.activeElement))dialog.value.focus();});
onUnmounted(()=>clearTimeout(feedbackTimer));
function dialogKey(event:KeyboardEvent){if(event.key==="Escape"){panel.value=null;event.preventDefault();}if(event.key!=="Tab")return;const elements=dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]');if(!elements?.length)return;const first=elements[0]!,last=elements[elements.length-1]!;if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.value)){last.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}}
</script>

<template>
  <div class="lab-shell">
    <header class="lab-header" :inert="panel!==null"><a class="brand" href="/import-lab.html"><span class="brand-mark">L</span><span>Lumeria <small>LAB / 02</small></span></a><div class="header-title">应用导入实验室 <span class="pill">交互原型</span></div><button class="quiet" @click="explain=!explain">{{ explain?'隐藏':'显示' }}变化说明</button></header>
    <div v-if="error" class="error" role="alert">{{ error }} <button @click="reset">重置实验</button></div>
    <main class="lab-layout" :class="{'no-inspector':!explain}" :inert="panel!==null">
      <aside class="scenario-panel">
        <div class="eyebrow">SCENARIO CONSOLE</div><h1>先整理好，<br>再交给用户。</h1><p class="subtle">用一次完整旅程，验证导入规则。所有操作仅影响此实验。</p>
        <div class="phase"><span :class="{done:state.started}">01</span><div><b>首次导入</b><small>{{ state.started?'已完成 · 自由整理布局':'选择来源，预览分组' }}</small></div></div>
        <div class="phase"><span>02</span><div><b>后续变化</b><small>安装 → 扫描 → 查看与整理</small></div></div>
        <section><div class="section-label">模拟安装 <span>不立即改动布局</span></div><button v-for="(batch,id) in installBatches" :key="id" class="scenario-button" :disabled="!state.started||state.installed.includes(id)" @click="install(id)"><span>{{ batch.label }} <small>{{ batch.description }}</small></span><b>{{ state.installed.includes(id)?'✓':'＋' }}</b></button></section>
        <button class="primary wide" :disabled="!state.started" @click="scan">↻ 自动扫描</button>
        <div class="button-pair"><button :disabled="!state.started" @click="openPanel('restore')">手动扫描 / 恢复</button><button :disabled="!state.started" @click="restart">模拟重启</button></div>
        <label class="check-line"><input v-model="state.offline" type="checkbox" @change="undo=null">来源离线 / 扫描不完整</label>
        <button class="quiet wide" :disabled="!state.started" @click="toggleVisible">{{ state.visible?'模拟隐藏到托盘':'再次打开启动台' }}</button>
        <details class="source-details"><summary>来源规则 <small>后续更改只影响新增</small></summary><div v-for="source in state.sources" :key="source.id" class="source-mini"><label><input v-model="source.enabled" type="checkbox" @change="undo=null">{{ source.name }}</label><select v-if="source.id!=='windows'" v-model="source.grouped" :aria-label="`${source.name}后续分组`"><option :value="true">按一级目录分组</option><option :value="false">全部展开</option></select><label v-if="source.grouped&&source.id!=='windows'"><input v-model="source.keepSingle" type="checkbox">保留单应用文件夹</label></div></details>
        <div class="sandbox-note"><span>◇ 独立沙盒</span><p>使用固定扫描样本。不会访问真实目录、启动软件或修改正式配置。系统快捷键与开机启动仅演示。</p></div>
        <button class="reset" @click="reset">重置全部实验</button>
      </aside>
      <section class="preview-panel">
        <div class="preview-heading"><span><i class="status-dot"></i> {{ state.started?'启动台 · 实验布局':'首次使用 · 设置预览' }}</span><span>{{ state.started?`${placedIds(state).length} 个应用 · ${folders.length} 个文件夹`:'可跳过，采用默认设置' }}</span></div>
        <div v-if="!state.started" class="onboarding winui-onboarding">
          <nav class="winui-steps" aria-label="初次设置进度">
            <span :aria-current="step===1?'step':undefined" :class="{active:step===1}"><i>{{ step===2?'✓':'1' }}</i>使用方式</span>
            <span class="step-line" aria-hidden="true"></span>
            <span :aria-current="step===2?'step':undefined" :class="{active:step===2}"><i>2</i>导入应用</span>
          </nav>
          <div class="winui-page-content">
            <header class="winui-page-heading">
              <div class="winui-app-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="3" y="3" width="11" height="11" rx="3" fill="currentColor"/><rect x="18" y="3" width="11" height="11" rx="3" fill="currentColor" opacity=".7"/><rect x="3" y="18" width="11" height="11" rx="3" fill="currentColor" opacity=".7"/><rect x="18" y="18" width="11" height="11" rx="3" fill="currentColor" opacity=".4"/></svg></div>
              <h2>{{ step===1?'欢迎使用 Lumeria':'选择要导入的应用' }}</h2>
              <p>{{ step===1?'让常用应用，随时触手可及。先设置适合你的使用方式。':'选择应用来源和排列方式。完成后，仍可自由移动和整理。' }}</p>
            </header>
            <template v-if="step===1">
              <h3 class="winui-section-title">个性化启动台</h3>
              <div class="winui-settings-cards">
                <div class="winui-setting-card">
                  <span class="winui-setting-icon" aria-hidden="true">⌨</span>
                  <label for="welcome-shortcut" class="winui-setting-copy"><b>呼出快捷键</b><small>快速打开或隐藏启动台</small></label>
                  <input id="welcome-shortcut" v-model="shortcut" aria-label="呼出快捷键" maxlength="40" class="winui-shortcut">
                </div>
                <div class="winui-setting-card">
                  <svg class="winui-setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>
                  <div class="winui-setting-copy"><b id="window-mode-label">窗口模式</b><small>选择启动台的显示方式</small></div>
                  <select v-model="mode" aria-labelledby="window-mode-label"><option value="fullscreen">全屏</option><option value="windowed">窗口</option></select>
                </div>
                <div class="winui-setting-card">
                  <svg class="winui-setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3v9m-5-7a9 9 0 1 0 10 0"/></svg>
                  <div class="winui-setting-copy"><b id="login-label">登录时启动</b><small>启动后驻留托盘，随时等待呼出</small></div>
                  <label class="winui-toggle"><span>{{ login?'开':'关' }}</span><input v-model="login" type="checkbox" role="switch" aria-labelledby="login-label"><i aria-hidden="true"></i></label>
                </div>
              </div>
              <div class="winui-info"><span aria-hidden="true">ⓘ</span><p>这是浏览器预览。快捷键、窗口模式和登录启动不会更改系统设置。</p></div>
            </template>
            <template v-else>
              <h3 class="winui-section-title">应用来源</h3>
              <div class="source-list winui-source-list">
                <div v-for="source in state.sources" :key="source.id" class="source-row">
                  <label><input v-model="source.enabled" type="checkbox"><span>{{ source.name }}<small>{{ source.path }}</small></span></label>
                  <select v-if="source.id!=='windows'" v-model="source.grouped" :disabled="!source.enabled" :aria-label="`${source.name}导入布局`"><option :value="true">按一级目录分组</option><option :value="false">全部展开</option></select>
                  <span v-else class="subtle">直接显示应用</span>
                </div>
              </div>
              <div class="winui-info"><span aria-hidden="true">ⓘ</span><p>同一目录中的多个应用整理为文件夹；只有一个应用时直接显示。文件夹内不再嵌套文件夹。</p></div>
              <div class="import-preview winui-import-preview">
                <div class="section-label">导入预览 <span>{{ previewCount }} 个应用 · {{ preview.groups.length }} 个文件夹</span></div>
                <div class="preview-chips">
                  <div v-for="group in preview.groups" :key="group.key" class="group-chip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10H2Z" fill="#e8b84a"/><path d="M2 10h20v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" fill="#f5cd65"/></svg><b>{{ group.name }}</b><small>{{ group.appIds.length }} 个应用</small></div>
                  <div v-for="id in preview.singles" :key="id" class="app-chip">{{ name(id) }}</div>
                  <p v-if="!previewCount">未选择应用来源，可以从空白布局开始。</p>
                </div>
              </div>
            </template>
          </div>
          <footer class="onboard-actions winui-footer">
            <template v-if="step===1"><button class="quiet" @click="start">跳过，使用默认布局</button><button class="primary" @click="step=2">下一步：整理应用 →</button></template>
            <template v-else><button @click="step=1">← 上一步</button><button class="primary" @click="start">完成导入，开始体验</button></template>
          </footer>
        </div>
        <div v-else-if="!state.visible" class="hidden-preview"><span>☾</span><h2>启动台已隐藏</h2><p>现在可以模拟安装、自动扫描。<br>提示会等下次打开时显示。</p><button class="primary" @click="toggleVisible">打开启动台</button></div>
        <div v-else class="desktop">
          <div class="desktop-top"><label class="search-box"><span>⌕</span><input v-model="query" placeholder="搜索实验中的应用或文件夹" aria-label="搜索实验应用"></label><button v-if="state.recent.length" class="new-entry" title="查看新增应用与整理建议" @click="openPanel('recent')">＋ 新增 {{ state.recent.length }}</button><button aria-label="应用设置与扫描" title="应用设置与扫描" @click="openPanel('restore')">⚙</button></div>
          <div class="desktop-caption"><span>我的启动台</span><small>点击选择 · 双击打开文件夹</small></div>
          <div class="app-grid"><button v-for="item in visibleItems" :key="item.id" class="tile" :class="{selected:selected===item.id}" :aria-label="nameOrFolder(item)" :aria-pressed="selected===item.id" @click="inspect(item.id)" @dblclick="item.kind==='folder'&&(openFolder=item.id)"><span v-if="item.kind==='folder'" class="folder-art"><i v-for="id in item.apps.slice(0,4)" :key="id" :class="`color-${id.length%5}`">{{ name(id).slice(0,1) }}</i></span><span v-else class="app-art" :class="`color-${item.id.length%5}`">{{ name(item.id).slice(0,2) }}</span><span class="tile-label">{{ nameOrFolder(item) }}</span><small>{{ item.kind==='folder'?`${item.apps.length} 个应用`:state.recent.includes(item.id)?'新添加':'应用' }}</small></button><div v-if="!visibleItems.length" class="empty">{{ query?'没有匹配项':'还没有应用，可以开启来源后自动扫描。' }}</div></div>
          <section v-if="folder" class="folder-content"><div class="section-label">{{ folder.name }} <button class="quiet" @click="openFolder=null">收起 ×</button></div><div class="folder-apps"><button v-for="id in folder.apps" :key="id" :aria-pressed="selected===id" @click="inspect(id)"><i :class="`color-${id.length%5}`">{{ name(id).slice(0,1) }}</i>{{ name(id) }}</button></div></section>
          <div v-if="selectedFolder||selectedApp" class="edit-panel"><template v-if="selectedFolder"><b>整理文件夹</b><label>名称 <input v-model="newName" maxlength="32" aria-label="文件夹名称"></label><button :disabled="!newName.trim()" @click="rename">保存名称</button><button @click="openFolder=selectedFolder.id">查看内容</button><button class="danger" @click="dissolve">解散文件夹</button></template><template v-else-if="selectedApp"><b>{{ name(selectedApp) }}</b><select v-model="moveTarget" aria-label="移动目标"><option value="desktop">启动台末尾</option><option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option></select><button @click="move">移动</button><button @click="remove()">从启动台移除</button><details><summary>更多</summary><button class="danger" @click="remove(true)">排除此应用</button><input v-model="newName" placeholder="新文件夹名称" aria-label="新文件夹名称" maxlength="32"><button :disabled="!newName.trim()" @click="manualFolder">放入新文件夹</button></details></template></div>
          <div class="desktop-footer"><span>仅单层文件夹 · 用户布局优先</span><button v-if="undo" @click="undoArrange">撤销上次整理</button></div>
        </div>
        <div v-if="feedback" class="feedback" role="status">{{ feedback }}</div>
      </section>
      <aside v-if="explain" class="inspector"><div class="eyebrow">WHY IT HAPPENED</div><h2>每一步，都有依据。</h2><div class="rule-note"><b>本轮实验规则</b><p>首次导入可分组；自动扫描只追加。整理建议经确认后执行，手动移动过的应用不再参与本批整理。</p></div><details open><summary>最近操作 <span>{{ state.history.length }}</span></summary><ol class="timeline"><li v-for="(entry,index) in state.history.slice(0,8)" :key="index">{{ entry }}</li><li v-if="!state.history.length">等待首次导入。尝试在第二步切换来源和分组方式。</li></ol></details><details><summary>最近扫描的判断</summary><div v-for="row in lastPlan.decisions" :key="row.id" class="decision"><b>{{ row.name }}</b><small>{{ reasonLabels[row.reason] }}</small></div></details><details><summary>扫描前已处理的样本</summary><p class="subtle">由固定的扫描契约样本提供，不在浏览器重新解析快捷方式。</p><div v-for="entry in filteredEntries" :key="entry.name" class="decision"><b>{{ entry.name }}</b><small>{{ entry.reason }}</small></div></details><details><summary>隐藏与排除记录</summary><p v-if="!state.hidden.length" class="subtle">暂无记录</p><div v-for="id in state.hidden" :key="id" class="decision"><b>{{ name(id) }}</b><small>{{ state.excluded.includes(id)?'已排除':'已移除，可手动恢复' }}</small></div></details><div class="test-path"><b>建议这样试</b><p>导入 → 工具合集 改名 → 安装新工具 → 扫描 → 查看建议 → 移除 示例播放器 → 再扫描 → 模拟重启。</p></div></aside>
    </main>
    <div v-if="panel" class="modal-backdrop" @click.self="panel=null"><section ref="dialog" class="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title" tabindex="-1" @keydown="dialogKey"><header><div><div class="eyebrow">REVIEW BEFORE ARRANGING</div><h2 id="review-title">{{ panel==='recent'?'放置预览':'手动扫描与导入' }}</h2></div><button class="icon-button" aria-label="关闭结果" @click="panel=null">×</button></header><nav v-if="panel==='restore'" class="manual-progress" aria-label="手动导入步骤"><span :class="{active:manualStep===1}">1 选择应用</span><span>→</span><span :class="{active:manualStep===2}">2 预览放置</span></nav>
          <p v-if="state.offline" role="alert" class="manual-warning">来源不可访问，不能应用扫描结果。请关闭窗口，恢复来源后重试。</p>
          <p v-if="manualError" role="alert" class="manual-warning">{{ manualError }}</p>
          <template v-if="panel==='restore'&&manualStep===1">
            <p class="subtle">选择要添加或整理的应用。已移除和此前暂不添加的应用默认不勾选。</p>
            <input v-model="manualSearch" class="manual-search" aria-label="搜索扫描结果" placeholder="搜索扫描结果">
            <div v-if="!filteredManualRows.length" class="empty">没有匹配的待添加应用。可以先模拟安装，再打开手动扫描。</div>
            <label v-for="app in filteredManualRows" :key="app.id" class="restore-row"><input v-model="checked" type="checkbox" :value="app.id">{{ app.name }}<small>{{ statusLabels[app.status as keyof typeof statusLabels] }}</small></label>
            <details v-if="state.excluded.length"><summary>已排除 · {{ state.excluded.length }}</summary><div v-for="id in state.excluded" :key="id" class="recent-row"><span>{{ name(id) }}</span><button @click="unexclude(id)">取消排除</button></div></details>
            <p class="manual-footnote">最终确认时，未勾选的新应用将记为“暂不添加”，避免自动扫描立即加入；以后可手动恢复。取消窗口不会更改选择记录。</p>
            <footer><button @click="panel=null">取消</button><button class="primary" :disabled="!checked.length||state.offline" @click="nextManual">下一步（已选 {{ checked.length }}）</button></footer>
          </template>
          <template v-else>
            <PlacementPreview :rows="placements" :folders="folders" :names="names" :already-added="panel==='recent'" @choose="(key,target)=>{const row=placements.find(r=>r.key===key);if(row)row.target=target;}" />
            <footer><button v-if="panel==='restore'" @click="manualStep=1;manualError=''">上一步：修改选择</button><button v-else @click="panel=null">稍后处理</button><button class="primary" :disabled="state.offline||!placements.length" @click="confirmPlacement">{{ panel==='recent'?'确认放置':'确认添加' }}</button></footer>
          </template>
        </section></div>
  </div>
</template>
