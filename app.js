const configured = !SUPABASE_URL.includes("COLE_") && !SUPABASE_ANON_KEY.includes("COLE_");
const db = configured ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let currentRoom = document.body.dataset.room || null;
const fixedRoom = currentRoom;
let currentUser = null;
let currentItem = null;
let currentConversation = null;
let myPostsOnly = false;
let inboxChannel = null;
let isAdmin = false;
let currentProfile = null;
const $ = s => document.querySelector(s);
const rooms = Array.from({length:14},(_,i)=>String(i+1));
const extraLocations = [
  {value:"patio", label:"Pátio", file:"patio.html"},
  {value:"corredor", label:"Corredor", file:"corredor.html"}
];
function locationLabel(v){
  if(v==="patio") return "Pátio";
  if(v==="corredor") return "Corredor";
  return `Sala ${v}`;
}

function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function openModal(id){const el=$("#"+id); if(el) el.classList.remove("hidden")}
function closeModal(id){const el=$("#"+id); if(el) el.classList.add("hidden")}
function formatDate(d){if(!d)return"Sem data";return new Date(d+"T12:00:00").toLocaleDateString("pt-BR")}
function formatTime(d){return new Date(d).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
function configWarning(sel){const el=$(sel); if(el) el.textContent="Configure o Supabase no arquivo config.js primeiro."}

function defaultDisplayName(user){
  const meta=user?.user_metadata||{};
  const googleName=meta.full_name||meta.name||meta.user_name;
  if(googleName && String(googleName).trim()) return String(googleName).trim().slice(0,60);
  const email=user?.email||"";
  if(email.includes("@")) return email.split("@")[0].slice(0,60);
  return "Usuário";
}

async function ensureProfile(user=currentUser){
  if(!db||!user)return null;
  const {data,error}=await db.from("profiles").select("id,display_name,role").eq("id",user.id).maybeSingle();
  if(error){
    console.warn("Não foi possível carregar o perfil:",error);
    return null;
  }
  if(data)return data;

  const display_name=defaultDisplayName(user);
  const {data:created,error:createError}=await db.from("profiles")
    .insert({id:user.id,display_name})
    .select("id,display_name,role")
    .single();
  if(createError){
    console.warn("Não foi possível criar o perfil:",createError);
    return {id:user.id,display_name,role:"user"};
  }
  return created;
}


async function updateAdminState(){
  isAdmin=false;
  currentProfile=null;
  if(!db||!currentUser){
    renderAdminNav();
    return;
  }

  const {data,error}=await db
    .from("profiles")
    .select("id,display_name,role")
    .eq("id",currentUser.id)
    .maybeSingle();

  if(error){
    console.warn("Erro ao verificar administrador:",error);
    renderAdminNav();
    return;
  }

  currentProfile=data||null;
  isAdmin=data?.role==="admin";
  renderAdminNav();
}

function renderAdminNav(){
  let btn=$("#btnAdmin");
  if(isAdmin){
    if(!btn){
      const nav=document.querySelector(".topbar nav");
      if(nav){
        btn=document.createElement("button");
        btn.id="btnAdmin";
        btn.className="ghost admin-nav-btn";
        btn.textContent="Painel Chefe";
        const profileBtn=$("#btnProfile");
        const authBtn=$("#btnAuth");
        nav.insertBefore(btn,profileBtn||authBtn||null);
      }
    }
    if(btn) btn.onclick=openAdminPanel;
  }else if(btn){
    btn.remove();
  }
}

async function getProfileName(userId){
  if(!db||!userId)return "Usuário";
  const {data}=await db.from("profiles").select("display_name").eq("id",userId).maybeSingle();
  return data?.display_name||"Usuário";
}

async function attachProfileNames(items){
  if(!db||!items?.length)return items||[];
  const ids=[...new Set(items.map(i=>i.user_id).filter(Boolean))];
  if(!ids.length)return items;
  const {data,error}=await db.from("profiles").select("id,display_name").in("id",ids);
  if(error){
    console.warn("Erro ao carregar nomes dos autores:",error);
    return items;
  }
  const names=new Map((data||[]).map(p=>[p.id,p.display_name]));
  return items.map(i=>({...i,author_name:names.get(i.user_id)||"Usuário"}));
}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));

function setupRooms(){
  const roomLinks=rooms.map(n=>`<a class="room ${currentRoom===n?"active":""}" href="sala${n}.html">Sala ${n}</a>`);
  const extraLinks=extraLocations.map(l=>`<a class="room ${currentRoom===l.value?"active":""}" href="${l.file}">${l.label}</a>`);
  if($("#roomTabs")) $("#roomTabs").innerHTML=[...roomLinks,...extraLinks].join("");

  const cards=$("#roomCards");
  if(cards){
    cards.innerHTML=[
      ...rooms.map(n=>`<a class="room-app-card" href="sala${n}.html">
        <span class="room-number">SALA ${String(n).padStart(2,"0")}</span>
        <strong>Sala ${n}</strong>
        <span class="room-arrow">→</span>
      </a>`),
      ...extraLocations.map(l=>`<a class="room-app-card" href="${l.file}">
        <span class="room-number">LOCAL</span>
        <strong>${l.label}</strong>
        <span class="room-arrow">→</span>
      </a>`)
    ].join("");
  }

  if($("#postRoom")){
    $("#postRoom").innerHTML=[
      ...rooms.map(n=>`<option value="${n}" ${currentRoom===n?"selected":""}>Sala ${n}</option>`),
      ...extraLocations.map(l=>`<option value="${l.value}" ${currentRoom===l.value?"selected":""}>${l.label}</option>`)
    ].join("");
  }

  if(fixedRoom && $("#postRoom")){
    $("#postRoom").value=String(fixedRoom);
    $("#postRoom").disabled=true;
  }
}

async function refreshAuth(){
  if(!db)return;
  const {data:{user}}=await db.auth.getUser();
  currentUser=user;
  if($("#btnAuth")) $("#btnAuth").textContent=user?"Sair":"Entrar";
  if(user){await ensureProfile(user);await updateAdminState();subscribeInbox();updateUnreadBadge();}
  else{isAdmin=false;currentProfile=null;renderAdminNav();if($("#unreadBadge")) $("#unreadBadge").classList.add("hidden");unsubscribeInbox();}
}

if($("#btnAuth")) $("#btnAuth").onclick=async()=>{
  if(currentUser){await db.auth.signOut();currentUser=null;$("#btnAuth").textContent="Entrar";unsubscribeInbox();loadItems();}
  else openModal("authModal");
};

if($("#authForm")) $("#authForm").onsubmit=async e=>{
  e.preventDefault();if(!db)return configWarning("#authMessage");
  const {error}=await db.auth.signInWithPassword({email:$("#authEmail").value.trim(),password:$("#authPassword").value});
  $("#authMessage").textContent=error?error.message:"Login realizado!";
  if(!error){await refreshAuth();setTimeout(()=>closeModal("authModal"),400);}
};

if($("#btnSignup")) $("#btnSignup").onclick=async()=>{
  if(!db)return configWarning("#authMessage");
  const {error}=await db.auth.signUp({email:$("#authEmail").value.trim(),password:$("#authPassword").value});
  $("#authMessage").textContent=error?error.message:"Conta criada. Confira seu e-mail se a confirmação estiver ativada.";
};


function setupGoogleLogin(){
  const form=$("#authForm");
  if(!form || $("#btnGoogleLogin")) return;

  const separator=document.createElement("div");
  separator.className="auth-separator";
  separator.innerHTML="<span>ou</span>";

  const btn=document.createElement("button");
  btn.type="button";
  btn.id="btnGoogleLogin";
  btn.className="google-login wide";
  btn.innerHTML=`
    <span class="google-g" aria-hidden="true">G</span>
    <span>Continuar com Google</span>
  `;

  form.insertAdjacentElement("afterend", separator);
  separator.insertAdjacentElement("afterend", btn);

  btn.onclick=async()=>{
    if(!db) return configWarning("#authMessage");

    const msg=$("#authMessage");
    btn.disabled=true;
    btn.querySelector("span:last-child").textContent="Abrindo Google...";
    if(msg) msg.textContent="";

    const redirectTo=window.location.origin + window.location.pathname;

    const {error}=await db.auth.signInWithOAuth({
      provider:"google",
      options:{
        redirectTo,
        queryParams:{
          prompt:"select_account"
        }
      }
    });

    if(error){
      console.error("Erro no login Google:",error);
      if(msg) msg.textContent=error.message;
      btn.disabled=false;
      btn.querySelector("span:last-child").textContent="Continuar com Google";
    }
  };
}

if($("#btnNew")) $("#btnNew").onclick=()=>{
  if(!currentUser){openModal("authModal");$("#authMessage").textContent="Entre para publicar.";return;}
  $("#postDate").value=new Date().toISOString().slice(0,10);openModal("postModal");
};

if($("#postForm")) $("#postForm").onsubmit=async e=>{
  e.preventDefault();if(!db)return configWarning("#postMessage");if(!currentUser)return;
  $("#postMessage").textContent="Publicando...";
  let image_url=null;const file=$("#postImage").files[0];
  if(file){
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=`${currentUser.id}/${crypto.randomUUID()}-${safe}`;
    const {error}=await db.storage.from("item-images").upload(path,file);
    if(error){$("#postMessage").textContent=error.message;return;}
    image_url=db.storage.from("item-images").getPublicUrl(path).data.publicUrl;
  }
  const payload={user_id:currentUser.id,type:$("#postType").value,room:fixedRoom || $("#postRoom").value,title:$("#postTitle").value.trim(),description:$("#postDescription").value.trim(),location:$("#postLocation").value.trim(),event_date:$("#postDate").value,image_url};
  const {error}=await db.from("items").insert(payload);
  $("#postMessage").textContent=error?error.message:"Publicado!";
  if(!error){e.target.reset();setTimeout(()=>closeModal("postModal"),400);loadItems();}
};

async function loadItems(){
  if(!$("#itemsGrid")) return;
  if($("#listTitle")) $("#listTitle").textContent=myPostsOnly?"Minhas publicações":currentRoom?locationLabel(currentRoom):"Publicações recentes";
  if(!db){$("#itemsGrid").innerHTML=demoCards();if($("#emptyState"))$("#emptyState").classList.add("hidden");return;}
  let q=db.from("items").select("*").order("created_at",{ascending:false});
  if(currentRoom)q=q.eq("room",currentRoom);
  if(myPostsOnly&&currentUser)q=q.eq("user_id",currentUser.id);
  const term=$("#searchInput")?$("#searchInput").value.trim():"";if(term)q=q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  const type=$("#typeFilter")?$("#typeFilter").value:"";if(type)q=q.eq("type",type);
  const {data,error}=await q.limit(100);
  if(error){$("#itemsGrid").innerHTML=`<p>${esc(error.message)}</p>`;return;}
  const itemsWithNames=await attachProfileNames(data||[]);
  renderItems(itemsWithNames);
}

function renderItems(items){
  if($("#emptyState")) $("#emptyState").classList.toggle("hidden",items.length>0);
  $("#itemsGrid").innerHTML=items.map(i=>`<article class="item-card" data-id="${i.id}">
    <div class="item-image">${i.image_url?`<img src="${esc(i.image_url)}" alt="${esc(i.title)}">`:"Sem foto"}</div>
    <div class="item-body"><div class="row"><span class="pill ${i.type}">${i.type==="achado"?"ACHADO":"PERDIDO"}</span><strong>${locationLabel(String(i.room))}</strong></div>
    <h3>${esc(i.title)}</h3>
    <p class="item-author">Publicado por <strong>${esc(i.author_name||"Usuário")}</strong></p>
    <p>${esc(i.description).slice(0,150)}</p>
    <div class="meta">${esc(i.location||"Local não informado")} • ${formatDate(i.event_date)}</div></div>
  </article>`).join("");
  document.querySelectorAll(".item-card").forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
}

async function showDetail(id){
  if(!db)return;
  const {data:i,error}=await db.from("items").select("*").eq("id",id).single();
  if(error)return;
  currentItem=i;
  const mine=currentUser&&i.user_id===currentUser.id;
  const authorName=await getProfileName(i.user_id);
  $("#detailContent").innerHTML=`
    ${i.image_url?`<img class="detail-image" src="${esc(i.image_url)}" alt="${esc(i.title)}">`:""}
    <div class="row" style="margin-top:14px"><span class="pill ${i.type}">${i.type.toUpperCase()}</span><strong>${locationLabel(String(i.room))}</strong></div>
    <h2>${esc(i.title)}</h2>
    <p class="detail-author">Publicado por <strong>${esc(authorName)}</strong></p>
    <p class="detail-text">${esc(i.description)}</p>
    <p><strong>Local:</strong> ${esc(i.location||"Não informado")}<br><strong>Data:</strong> ${formatDate(i.event_date)}</p>
    ${!currentUser
      ? '<button class="secondary" id="btnLoginDetail">Entre para conversar</button>'
      : (mine || isAdmin)
        ? `<div class="owner-actions">
             ${mine?'<button class="secondary" id="btnOwnerInbox">Ver conversas deste item</button>':''}
             ${isAdmin?'<button class="secondary" id="btnAdminEditItem">Editar publicação</button>':''}
             <button class="danger" id="btnDeleteItem">${isAdmin&&!mine?'Excluir como chefe':'Excluir publicação'}</button>
           </div>`
        : '<button class="primary" id="btnStartChat">Conversar sobre este item</button>'}
  `;
  openModal("detailModal");
  const a=$("#btnLoginDetail");if(a)a.onclick=()=>{closeModal("detailModal");openModal("authModal")};
  const b=$("#btnStartChat");if(b)b.onclick=()=>startConversation(i);
  const c=$("#btnOwnerInbox");if(c)c.onclick=()=>{closeModal("detailModal");openInbox(i.id)};
  const d=$("#btnDeleteItem");if(d)d.onclick=()=>deleteItem(i);
  const e=$("#btnAdminEditItem");if(e)e.onclick=()=>openAdminEditItem(i);
}


async function deleteItem(item){
  if(!db || !currentUser) return;

  if(item.user_id !== currentUser.id && !isAdmin){
    alert("Você não tem permissão para excluir esta publicação.");
    return;
  }

  const confirmar = confirm(
    `Excluir "${item.title}"?\n\nEssa ação também removerá as conversas e mensagens relacionadas a esta publicação.`
  );

  if(!confirmar) return;

  const btn=$("#btnDeleteItem");
  if(btn){
    btn.disabled=true;
    btn.textContent="Excluindo...";
  }

  let deleteQuery=db.from("items").delete().eq("id",item.id);
  if(!isAdmin) deleteQuery=deleteQuery.eq("user_id",currentUser.id);
  const {error}=await deleteQuery;

  if(error){
    console.error("Erro ao excluir publicação:", error);
    alert("Não foi possível excluir a publicação.\n\n"+error.message+
      "\n\nExecute o arquivo permitir_excluir_publicacao.sql no Supabase.");
    if(btn){
      btn.disabled=false;
      btn.textContent="Excluir publicação";
    }
    return;
  }

  currentItem=null;
  closeModal("detailModal");
  await loadItems();
  alert("Publicação excluída com sucesso.");
}

async function startConversation(item){
  if(!db){alert("Supabase não configurado.");return;}
  if(!currentUser){openModal("authModal");return;}
  if(item.user_id===currentUser.id){
    alert("Esta publicação é sua. Abra Conversas para responder às pessoas interessadas.");
    return;
  }

  try{
    let {data:conv,error:findError}=await db
      .from("conversations")
      .select("*")
      .eq("item_id",item.id)
      .eq("requester_id",currentUser.id)
      .maybeSingle();

    if(findError) throw findError;

    if(!conv){
      const {data,error}=await db
        .from("conversations")
        .insert({
          item_id:item.id,
          item_owner_id:item.user_id,
          requester_id:currentUser.id
        })
        .select("*")
        .single();

      if(error) throw error;
      conv=data;
    }

    closeModal("detailModal");
    await openInbox(null,conv.id);
  }catch(err){
    console.error("Erro ao iniciar conversa:",err);
    alert("Não foi possível iniciar a conversa.\n\n"+(err?.message||String(err))+
      "\n\nExecute o arquivo reparo_chat.sql no SQL Editor do Supabase.");
  }
}

if($("#btnInbox")) $("#btnInbox").onclick=()=>{
  if(!currentUser){
    openModal("authModal");
    if($("#authMessage")) $("#authMessage").textContent="Entre para abrir suas conversas.";
    return;
  }
  openInbox();
};
if($("#btnRefreshInbox")) $("#btnRefreshInbox").onclick=()=>loadConversations(currentConversation?.id);

async function openInbox(filterItemId=null,conversationId=null){
  if(!currentUser){
    openModal("authModal");
    return;
  }
  openModal("inboxModal");
  if($("#conversationList")) $("#conversationList").innerHTML='<div class="empty"><p>Carregando conversas...</p></div>';
  await loadConversations(conversationId,filterItemId);
}

async function loadConversations(selectId=null,filterItemId=null){
  if(!currentUser||!db)return;

  let q=db
    .from("conversations")
    .select("id,item_id,item_owner_id,requester_id,created_at,updated_at,items(id,user_id,type,room,title,image_url)")
    .or(`item_owner_id.eq.${currentUser.id},requester_id.eq.${currentUser.id}`)
    .order("updated_at",{ascending:false});

  if(filterItemId) q=q.eq("item_id",filterItemId);

  const {data,error}=await q;

  if(error){
    console.error("Erro ao carregar conversas:",error);
    if($("#conversationList")){
      $("#conversationList").innerHTML=
        `<div class="empty"><h3>Erro ao abrir conversas</h3><p>${esc(error.message)}</p><p>Execute <strong>reparo_chat.sql</strong> no Supabase.</p></div>`;
    }
    return;
  }

  const convs=data||[];
  const cards=[];

  for(const c of convs){
    const {data:last,error:lastError}=await db
      .from("messages")
      .select("id,body,sender_id,created_at,read_at")
      .eq("conversation_id",c.id)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();

    if(lastError) console.error("Erro ao buscar última mensagem:",lastError);

    const {count,error:countError}=await db
      .from("messages")
      .select("id",{count:"exact",head:true})
      .eq("conversation_id",c.id)
      .neq("sender_id",currentUser.id)
      .is("read_at",null);

    if(countError) console.error("Erro ao contar não lidas:",countError);

    cards.push({...c,last_message:last||null,unread:count||0});
  }

  renderConversationList(cards);

  const idToOpen=selectId || currentConversation?.id;
  if(idToOpen){
    const found=cards.find(c=>c.id===idToOpen);
    if(found) await openConversation(found);
  }
  updateUnreadBadge(cards);
}

function renderConversationList(convs){
  if(!$("#conversationList")) return;
  if(!convs.length){
    $("#conversationList").innerHTML='<div class="empty"><h3>Nenhuma conversa</h3><p>Abra uma publicação de outra pessoa e clique em “Conversar sobre este item”.</p></div>';
    if($("#chatPlaceholder")) $("#chatPlaceholder").classList.remove("hidden");
    if($("#activeChat")) $("#activeChat").classList.add("hidden");
    return;
  }

  $("#conversationList").innerHTML=convs.map(c=>`
    <div class="conversation-card ${currentConversation?.id===c.id?"active":""}" data-conv="${c.id}">
      ${c.items?.image_url?`<img class="conversation-thumb" src="${esc(c.items.image_url)}" alt="">`:'<div class="conversation-thumb"></div>'}
      <div class="conversation-main">
        <strong>${esc(c.items?.title||"Item")}</strong>
        <span>${esc(c.last_message?.body||"Conversa iniciada — envie a primeira mensagem")}</span>
      </div>
      <div class="conversation-side">
        <small>${c.last_message?formatTime(c.last_message.created_at):""}</small>
        ${c.unread?'<span class="dot"></span>':""}
      </div>
    </div>`).join("");

  document.querySelectorAll(".conversation-card").forEach(el=>el.onclick=()=>{
    const c=convs.find(x=>x.id===el.dataset.conv);
    if(c) openConversation(c);
  });
}

async function openConversation(conv){
  currentConversation=conv;
  if($("#chatPlaceholder")) $("#chatPlaceholder").classList.add("hidden");
  if($("#activeChat")) $("#activeChat").classList.remove("hidden");
  if($("#activeChatTitle")) $("#activeChatTitle").textContent=conv.items?.title||"Item";
  if($("#activeChatSubtitle")) $("#activeChatSubtitle").textContent=`${locationLabel(String(conv.items?.room||"-"))} • ${conv.items?.type==="achado"?"Achado":"Perdido"}`;
  if($("#btnOpenItem")) $("#btnOpenItem").onclick=()=>showDetail(conv.item_id);

  document.querySelectorAll(".conversation-card").forEach(el=>
    el.classList.toggle("active",el.dataset.conv===conv.id)
  );

  await markConversationRead(conv.id);
  await loadMessages(conv.id);
}

async function loadMessages(conversationId){
  if(!$("#messages")) return;

  const {data,error}=await db
    .from("messages")
    .select("id,conversation_id,sender_id,body,read_at,created_at")
    .eq("conversation_id",conversationId)
    .order("created_at",{ascending:true});

  if(error){
    console.error("Erro ao carregar mensagens:",error);
    $("#messages").innerHTML=`<div class="empty"><p>Erro: ${esc(error.message)}</p></div>`;
    return;
  }

  $("#messages").innerHTML=(data||[]).length
    ? (data||[]).map(m=>`
      <div class="bubble-wrap ${m.sender_id===currentUser.id?"me":""}">
        <div class="bubble">${esc(m.body)}<small>${formatTime(m.created_at)}</small></div>
      </div>`).join("")
    : '<div class="empty"><p>Nenhuma mensagem ainda. Envie a primeira.</p></div>';

  $("#messages").scrollTop=$("#messages").scrollHeight;
}

if($("#messageForm")) $("#messageForm").onsubmit=async e=>{
  e.preventDefault();

  if(!currentUser||!currentConversation){
    alert("Selecione uma conversa primeiro.");
    return;
  }

  const input=$("#messageInput");
  const body=input.value.trim();
  if(!body)return;

  const button=e.target.querySelector('button[type="submit"]');
  if(button){button.disabled=true;button.textContent="Enviando...";}

  const {error}=await db.from("messages").insert({
    conversation_id:currentConversation.id,
    sender_id:currentUser.id,
    body
  });

  if(button){button.disabled=false;button.textContent="Enviar";}

  if(error){
    console.error("Erro ao enviar mensagem:",error);
    alert("Não foi possível enviar a mensagem.\n\n"+error.message+
      "\n\nExecute o arquivo reparo_chat.sql no SQL Editor do Supabase.");
    return;
  }

  input.value="";
  await loadMessages(currentConversation.id);
  await loadConversations(currentConversation.id);
};

async function markConversationRead(conversationId){
  if(!currentUser)return;
  const {error}=await db
    .from("messages")
    .update({read_at:new Date().toISOString()})
    .eq("conversation_id",conversationId)
    .neq("sender_id",currentUser.id)
    .is("read_at",null);

  if(error) console.error("Erro ao marcar como lida:",error);
  updateUnreadBadge();
}

async function updateUnreadBadge(preloaded=null){
  if(!currentUser||!db||!$("#unreadBadge"))return;

  let total=0;

  if(preloaded){
    total=preloaded.reduce((s,c)=>s+(c.unread||0),0);
  }else{
    const {data:convs,error}=await db
      .from("conversations")
      .select("id")
      .or(`item_owner_id.eq.${currentUser.id},requester_id.eq.${currentUser.id}`);

    if(error){
      console.error("Erro ao atualizar badge:",error);
      return;
    }

    for(const c of convs||[]){
      const {count}=await db
        .from("messages")
        .select("id",{count:"exact",head:true})
        .eq("conversation_id",c.id)
        .neq("sender_id",currentUser.id)
        .is("read_at",null);
      total+=count||0;
    }
  }

  $("#unreadBadge").textContent=total;
  $("#unreadBadge").classList.toggle("hidden",total===0);
}

function subscribeInbox(){
  if(!db||!currentUser)return;
  unsubscribeInbox();

  inboxChannel=db.channel(`ixhei-chat-${currentUser.id}`)
    .on("postgres_changes",
      {event:"INSERT",schema:"public",table:"messages"},
      async payload=>{
        if(!currentUser)return;

        if(currentConversation?.id===payload.new.conversation_id){
          await markConversationRead(currentConversation.id);
          await loadMessages(currentConversation.id);
        }

        if(!$("#inboxModal")?.classList.contains("hidden")){
          await loadConversations(currentConversation?.id);
        }else{
          await updateUnreadBadge();
        }
      })
    .subscribe(status=>{
      console.log("Realtime IXHEI:",status);
    });
}

function unsubscribeInbox(){
  if(inboxChannel&&db){
    db.removeChannel(inboxChannel);
    inboxChannel=null;
  }
}

if($("#searchInput")) $("#searchInput").oninput=debounce(loadItems,350);
if($("#typeFilter")) $("#typeFilter").onchange=loadItems;
if($("#btnClearRoom")) $("#btnClearRoom").onclick=()=>{ if(fixedRoom){location.href="index.html";return;} currentRoom=null;myPostsOnly=false;document.querySelectorAll(".room").forEach(x=>x.classList.remove("active"));loadItems()};
if($("#btnHome")) $("#btnHome").onclick=()=>{ if(fixedRoom){location.href="index.html";return;} currentRoom=null;myPostsOnly=false;loadItems()};
if($("#btnMyPosts")) $("#btnMyPosts").onclick=()=>{if(!currentUser){openModal("authModal");return;}myPostsOnly=true;currentRoom=fixedRoom||null;loadItems()};

function demoCards(){
  return [["achado",3,"Garrafa azul","Garrafa encontrada perto das carteiras.","Próximo à janela"],["perdido",8,"Estojo preto","Estojo com lápis e canetas.","Sala 8"],["achado",12,"Chaveiro","Chaveiro encontrado depois da aula.","Corredor"]].map(d=>`<article class="item-card"><div class="item-image">Exemplo</div><div class="item-body"><div class="row"><span class="pill ${d[0]}">${d[0].toUpperCase()}</span><strong>Sala ${d[1]}</strong></div><h3>${d[2]}</h3><p>${d[3]}</p><div class="meta">${d[4]}</div></div></article>`).join("");
}


async function showProfile(){
  if(!currentUser){
    openModal("authModal");
    if($("#authMessage")) $("#authMessage").textContent="Entre para abrir seu perfil.";
    return;
  }

  const profile=await ensureProfile(currentUser);
  const currentName=profile?.display_name||defaultDisplayName(currentUser);

  const old=document.querySelector("#profileModal");
  if(old) old.remove();

  const wrap=document.createElement("div");
  wrap.id="profileModal";
  wrap.className="modal";
  wrap.innerHTML=`<div class="modal-card small">
    <button class="close" id="closeProfile">×</button>
    <div class="profile-panel">
      <span class="badge" style="color:#4437d6;background:#eceafe;border:0">PERFIL</span>
      <h2>Meu perfil</h2>

      <div class="profile-name-box">
        <label for="profileName">Nome de usuário</label>
        <input id="profileName" maxlength="60" value="${esc(currentName)}" />
        <small>Ao entrar pela primeira vez com Google, usamos o nome da sua conta. Você pode alterá-lo aqui.</small>
        <button class="primary wide" id="profileSaveName">Salvar nome</button>
        <p id="profileMessage" class="message"></p>
      </div>

      <p class="profile-email">${esc(currentUser.email||"")}</p>
      <button class="secondary wide" id="profilePosts">Minhas publicações</button>
      <button class="secondary wide" id="profileChats">Minhas conversas</button>
      <button class="ghost wide" id="profileLogout">Sair da conta</button>
    </div>
  </div>`;

  document.body.appendChild(wrap);

  $("#closeProfile").onclick=()=>wrap.remove();

  $("#profileSaveName").onclick=async()=>{
    const input=$("#profileName");
    const msg=$("#profileMessage");
    const name=input.value.trim();

    if(name.length<2){
      msg.textContent="Digite um nome com pelo menos 2 caracteres.";
      return;
    }

    const btn=$("#profileSaveName");
    btn.disabled=true;
    btn.textContent="Salvando...";

    const {error}=await db.from("profiles")
      .update({display_name:name,updated_at:new Date().toISOString()})
      .eq("id",currentUser.id);

    btn.disabled=false;
    btn.textContent="Salvar nome";

    if(error){
      console.error("Erro ao alterar nome:",error);
      msg.textContent="Não foi possível salvar: "+error.message;
      return;
    }

    msg.textContent="Nome atualizado!";
    await loadItems();
  };

  $("#profilePosts").onclick=()=>{
    wrap.remove();
    myPostsOnly=true;
    currentRoom=fixedRoom||null;
    loadItems();
    window.scrollTo({top:document.body.scrollHeight/2,behavior:"smooth"});
  };

  $("#profileChats").onclick=()=>{
    wrap.remove();
    openInbox();
  };

  $("#profileLogout").onclick=async()=>{
    await db.auth.signOut();
    wrap.remove();
    currentUser=null;
    if($("#btnAuth")) $("#btnAuth").textContent="Entrar";
    loadItems();
  };
}

function applyTypeFilter(type){
  $("#typeFilter").value=type;
  myPostsOnly=false;
  loadItems();
  const target=$("#itemsGrid"); if(target) target.scrollIntoView({behavior:"smooth",block:"start"});
}

const bind=(id,fn)=>{const el=$("#"+id);if(el)el.onclick=fn};
bind("btnAchados",()=>applyTypeFilter("achado"));
bind("btnPerdidos",()=>applyTypeFilter("perdido"));
bind("btnProfile",showProfile);
bind("btnHeroPublish",()=>$("#btnNew").click());
bind("btnHeroLost",()=>applyTypeFilter("perdido"));
bind("quickAchados",()=>applyTypeFilter("achado"));
bind("quickPerdidos",()=>applyTypeFilter("perdido"));
bind("quickConversas",()=>$("#btnInbox").click());
bind("quickPerfil",showProfile);
bind("bottomHome",()=>{location.href="index.html"});
bind("bottomAchados",()=>applyTypeFilter("achado"));
bind("bottomPublish",()=>$("#btnNew").click());
bind("bottomInbox",()=>$("#btnInbox").click());
bind("bottomProfile",showProfile);


async function openAdminPanel(){
  if(!currentUser || !isAdmin){
    alert("Acesso restrito ao perfil Chefe.");
    return;
  }

  let modal=$("#adminModal");
  if(!modal){
    modal=document.createElement("div");
    modal.id="adminModal";
    modal.className="modal";
    modal.innerHTML=`
      <div class="modal-card admin-modal-card">
        <button class="close" id="closeAdminModal">×</button>
        <div class="admin-header">
          <div>
            <span class="badge admin-badge">CHEFE</span>
            <h2>Painel de administração</h2>
            <p>Gerencie publicações e perfis públicos do IXHEI.</p>
          </div>
        </div>

        <div class="admin-tabs">
          <button class="secondary admin-tab active" data-admin-tab="items">Publicações</button>
          <button class="secondary admin-tab" data-admin-tab="users">Usuários</button>
          <button class="secondary admin-tab" data-admin-tab="chats">Conversas</button>
        </div>

        <div id="adminItemsPanel">
          <div class="admin-toolbar">
            <input id="adminItemSearch" type="search" placeholder="Pesquisar publicação..." />
            <button class="secondary" id="adminRefreshItems">Atualizar</button>
          </div>
          <div id="adminItemsList" class="admin-list"></div>
        </div>

        <div id="adminUsersPanel" class="hidden">
          <div class="admin-toolbar">
            <input id="adminUserSearch" type="search" placeholder="Pesquisar nome..." />
            <button class="secondary" id="adminRefreshUsers">Atualizar</button>
          </div>
          <div id="adminUsersList" class="admin-list"></div>
        </div>

        <div id="adminChatsPanel" class="hidden">
          <div class="admin-toolbar">
            <input id="adminChatSearch" type="search" placeholder="Pesquisar item ou participante..." />
            <button class="secondary" id="adminRefreshChats">Atualizar</button>
          </div>
          <div id="adminChatsList" class="admin-list"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    $("#closeAdminModal").onclick=()=>modal.remove();

    document.querySelectorAll(".admin-tab").forEach(btn=>{
      btn.onclick=()=>{
        document.querySelectorAll(".admin-tab").forEach(b=>b.classList.toggle("active",b===btn));
        const tab=btn.dataset.adminTab;
        $("#adminItemsPanel").classList.toggle("hidden",tab!=="items");
        $("#adminUsersPanel").classList.toggle("hidden",tab!=="users");
        $("#adminChatsPanel").classList.toggle("hidden",tab!=="chats");
        if(tab==="users") loadAdminUsers();
        else if(tab==="chats") loadAdminChats();
        else loadAdminItems();
      };
    });

    $("#adminRefreshItems").onclick=loadAdminItems;
    $("#adminRefreshUsers").onclick=loadAdminUsers;
    $("#adminRefreshChats").onclick=loadAdminChats;
    $("#adminItemSearch").oninput=debounce(loadAdminItems,250);
    $("#adminUserSearch").oninput=debounce(loadAdminUsers,250);
    $("#adminChatSearch").oninput=debounce(loadAdminChats,250);
  }

  await loadAdminItems();
}

async function loadAdminItems(){
  if(!isAdmin || !$("#adminItemsList")) return;
  $("#adminItemsList").innerHTML='<div class="empty"><p>Carregando publicações...</p></div>';

  let q=db.from("items").select("*").order("created_at",{ascending:false}).limit(200);
  const term=$("#adminItemSearch")?.value.trim();
  if(term) q=q.or(`title.ilike.%${term}%,description.ilike.%${term}%,location.ilike.%${term}%`);

  const {data,error}=await q;
  if(error){
    $("#adminItemsList").innerHTML=`<div class="empty"><p>${esc(error.message)}</p></div>`;
    return;
  }

  const items=await attachProfileNames(data||[]);
  if(!items.length){
    $("#adminItemsList").innerHTML='<div class="empty"><p>Nenhuma publicação encontrada.</p></div>';
    return;
  }

  $("#adminItemsList").innerHTML=items.map(i=>`
    <article class="admin-row">
      <div class="admin-row-main">
        <strong>${esc(i.title)}</strong>
        <span>${esc(i.author_name||"Usuário")} • ${locationLabel(String(i.room))} • ${i.type==="achado"?"Achado":"Perdido"}</span>
      </div>
      <div class="admin-row-actions">
        <button class="secondary" data-admin-edit="${i.id}">Editar</button>
        <button class="danger" data-admin-delete="${i.id}">Excluir</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-admin-edit]").forEach(btn=>{
    btn.onclick=()=>{
      const item=items.find(i=>i.id===btn.dataset.adminEdit);
      if(item) openAdminEditItem(item);
    };
  });

  document.querySelectorAll("[data-admin-delete]").forEach(btn=>{
    btn.onclick=async()=>{
      const item=items.find(i=>i.id===btn.dataset.adminDelete);
      if(!item) return;
      if(!confirm(`Excluir "${item.title}" como Chefe?`)) return;
      const {error}=await db.from("items").delete().eq("id",item.id);
      if(error) alert(error.message);
      else{
        await loadAdminItems();
        await loadItems();
      }
    };
  });
}

function openAdminEditItem(item){
  if(!isAdmin) return;

  let modal=$("#adminEditItemModal");
  if(modal) modal.remove();

  modal=document.createElement("div");
  modal.id="adminEditItemModal";
  modal.className="modal";
  modal.innerHTML=`
    <div class="modal-card">
      <button class="close" id="closeAdminEdit">×</button>
      <span class="badge admin-badge">EDIÇÃO DO CHEFE</span>
      <h2>Editar publicação</h2>

      <form id="adminEditItemForm">
        <label>Título
          <input id="adminEditTitle" maxlength="80" required value="${esc(item.title)}" />
        </label>

        <label>Descrição
          <textarea id="adminEditDescription" maxlength="800" required>${esc(item.description||"")}</textarea>
        </label>

        <div class="two-cols">
          <label>Tipo
            <select id="adminEditType">
              <option value="achado" ${item.type==="achado"?"selected":""}>Achado</option>
              <option value="perdido" ${item.type==="perdido"?"selected":""}>Perdido</option>
            </select>
          </label>
          <label>Local do site
            <select id="adminEditRoom"></select>
          </label>
        </div>

        <label>Descrição do local
          <input id="adminEditLocation" maxlength="100" value="${esc(item.location||"")}" />
        </label>

        <label>Data
          <input id="adminEditDate" type="date" value="${esc(item.event_date||"")}" />
        </label>

        <button class="primary wide" type="submit">Salvar alterações</button>
        <p id="adminEditMessage" class="message"></p>
      </form>
    </div>`;

  document.body.appendChild(modal);
  $("#closeAdminEdit").onclick=()=>modal.remove();

  const sel=$("#adminEditRoom");
  sel.innerHTML=[
    ...rooms.map(n=>`<option value="${n}">Sala ${n}</option>`),
    ...extraLocations.map(l=>`<option value="${l.value}">${l.label}</option>`)
  ].join("");
  sel.value=String(item.room);

  $("#adminEditItemForm").onsubmit=async e=>{
    e.preventDefault();
    const payload={
      title:$("#adminEditTitle").value.trim(),
      description:$("#adminEditDescription").value.trim(),
      type:$("#adminEditType").value,
      room:$("#adminEditRoom").value,
      location:$("#adminEditLocation").value.trim(),
      event_date:$("#adminEditDate").value||null
    };

    const msg=$("#adminEditMessage");
    msg.textContent="Salvando...";

    const {error}=await db.from("items").update(payload).eq("id",item.id);
    if(error){
      msg.textContent=error.message;
      return;
    }

    msg.textContent="Alterações salvas.";
    setTimeout(()=>modal.remove(),350);
    await loadItems();
    if($("#adminModal")) await loadAdminItems();
  };
}

async function loadAdminUsers(){
  if(!isAdmin || !$("#adminUsersList")) return;
  $("#adminUsersList").innerHTML='<div class="empty"><p>Carregando usuários...</p></div>';

  let q=db.from("profiles")
    .select("id,display_name,role,updated_at")
    .order("display_name",{ascending:true})
    .limit(200);

  const term=$("#adminUserSearch")?.value.trim();
  if(term) q=q.ilike("display_name",`%${term}%`);

  const {data,error}=await q;
  if(error){
    $("#adminUsersList").innerHTML=`<div class="empty"><p>${esc(error.message)}</p></div>`;
    return;
  }

  $("#adminUsersList").innerHTML=(data||[]).map(p=>`
    <article class="admin-row">
      <div class="admin-row-main">
        <strong>${esc(p.display_name)}</strong>
        <span>${p.role==="admin"?"Chefe":"Usuário"}</span>
      </div>
      <div class="admin-row-actions">
        <button class="secondary" data-admin-user-edit="${p.id}" data-admin-user-name="${esc(p.display_name)}">
          Alterar nome
        </button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-admin-user-edit]").forEach(btn=>{
    btn.onclick=async()=>{
      const current=btn.dataset.adminUserName;
      const name=prompt("Novo nome público do usuário:",current);
      if(name===null) return;
      const clean=name.trim();
      if(clean.length<2 || clean.length>60){
        alert("O nome deve ter entre 2 e 60 caracteres.");
        return;
      }

      const {error}=await db.from("profiles")
        .update({display_name:clean})
        .eq("id",btn.dataset.adminUserEdit);

      if(error) alert(error.message);
      else{
        await loadAdminUsers();
        await loadItems();
      }
    };
  });
}



async function loadAdminChats(){
  if(!isAdmin || !$("#adminChatsList")) return;

  $("#adminChatsList").innerHTML='<div class="empty"><p>Carregando conversas...</p></div>';

  const {data:convs,error}=await db
    .from("conversations")
    .select("id,item_id,item_owner_id,requester_id,created_at,updated_at,items(id,title,room,type)")
    .order("updated_at",{ascending:false})
    .limit(200);

  if(error){
    $("#adminChatsList").innerHTML=`<div class="empty"><p>${esc(error.message)}</p></div>`;
    return;
  }

  const userIds=[...new Set((convs||[]).flatMap(c=>[c.item_owner_id,c.requester_id]).filter(Boolean))];
  let profileMap=new Map();

  if(userIds.length){
    const {data:profiles}=await db
      .from("profiles")
      .select("id,display_name")
      .in("id",userIds);

    profileMap=new Map((profiles||[]).map(p=>[p.id,p.display_name]));
  }

  const term=($("#adminChatSearch")?.value||"").trim().toLowerCase();

  const rows=(convs||[]).map(c=>({
    ...c,
    owner_name:profileMap.get(c.item_owner_id)||"Usuário",
    requester_name:profileMap.get(c.requester_id)||"Usuário"
  })).filter(c=>{
    if(!term) return true;
    const hay=[
      c.items?.title||"",
      c.owner_name,
      c.requester_name,
      locationLabel(String(c.items?.room||""))
    ].join(" ").toLowerCase();
    return hay.includes(term);
  });

  if(!rows.length){
    $("#adminChatsList").innerHTML='<div class="empty"><p>Nenhuma conversa encontrada.</p></div>';
    return;
  }

  $("#adminChatsList").innerHTML=rows.map(c=>`
    <article class="admin-row admin-chat-row">
      <div class="admin-row-main">
        <strong>${esc(c.items?.title||"Item")}</strong>
        <span>${esc(c.owner_name)} ↔ ${esc(c.requester_name)}</span>
        <small>${locationLabel(String(c.items?.room||"-"))}</small>
      </div>
      <div class="admin-row-actions">
        <button class="secondary" data-admin-open-chat="${c.id}">Ler conversa</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-admin-open-chat]").forEach(btn=>{
    btn.onclick=()=>openAdminChat(btn.dataset.adminOpenChat);
  });
}

async function openAdminChat(conversationId){
  if(!isAdmin) return;

  const {data:conv,error:convError}=await db
    .from("conversations")
    .select("id,item_id,item_owner_id,requester_id,items(id,title,room,type)")
    .eq("id",conversationId)
    .single();

  if(convError){
    alert(convError.message);
    return;
  }

  const ids=[conv.item_owner_id,conv.requester_id];
  const {data:profiles}=await db
    .from("profiles")
    .select("id,display_name")
    .in("id",ids);

  const names=new Map((profiles||[]).map(p=>[p.id,p.display_name]));

  const {data:messages,error}=await db
    .from("messages")
    .select("id,sender_id,body,created_at,read_at")
    .eq("conversation_id",conversationId)
    .order("created_at",{ascending:true});

  if(error){
    alert(error.message);
    return;
  }

  let modal=$("#adminChatModal");
  if(modal) modal.remove();

  modal=document.createElement("div");
  modal.id="adminChatModal";
  modal.className="modal";

  const ownerName=names.get(conv.item_owner_id)||"Usuário";
  const requesterName=names.get(conv.requester_id)||"Usuário";

  modal.innerHTML=`
    <div class="modal-card admin-chat-modal-card">
      <button class="close" id="closeAdminChat">×</button>
      <span class="badge admin-badge">VISUALIZAÇÃO DO CHEFE</span>
      <h2>${esc(conv.items?.title||"Conversa")}</h2>
      <p class="admin-chat-participants">${esc(ownerName)} ↔ ${esc(requesterName)}</p>

      <div class="admin-chat-messages">
        ${(messages||[]).length
          ? (messages||[]).map(m=>{
              const sender=names.get(m.sender_id)||"Usuário";
              return `<div class="admin-chat-message">
                <div class="admin-chat-message-head">
                  <strong>${esc(sender)}</strong>
                  <small>${formatTime(m.created_at)}</small>
                </div>
                <p>${esc(m.body)}</p>
              </div>`;
            }).join("")
          : '<div class="empty"><p>Nenhuma mensagem nesta conversa.</p></div>'
        }
      </div>
    </div>`;

  document.body.appendChild(modal);
  $("#closeAdminChat").onclick=()=>modal.remove();
}


if(db){
  db.auth.onAuthStateChange(async(event,session)=>{
    currentUser=session?.user||null;
    if($("#btnAuth")) $("#btnAuth").textContent=currentUser?"Sair":"Entrar";
    if(currentUser){
      await ensureProfile(currentUser);
      await updateAdminState();
      subscribeInbox();
      updateUnreadBadge();
      if(event==="SIGNED_IN") closeModal("authModal");
    }else{
      isAdmin=false; currentProfile=null; renderAdminNav();
      unsubscribeInbox();
      if($("#unreadBadge")) $("#unreadBadge").classList.add("hidden");
    }
  });
}

(async()=>{
  setupRooms();
  setupGoogleLogin();
  await refreshAuth();
  loadItems();
})();
