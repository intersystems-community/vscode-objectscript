const t=globalThis,e=t.ShadowRoot&&(void 0===t.ShadyCSS||t.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,s=Symbol(),i=new WeakMap;let o=class{constructor(t,e,i){if(this._$cssResult$=!0,i!==s)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o;const s=this.t;if(e&&void 0===t){const e=void 0!==s&&1===s.length;e&&(t=i.get(s)),void 0===t&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),e&&i.set(s,t))}return t}toString(){return this.cssText}};const r=t=>new o("string"==typeof t?t:t+"",void 0,s),n=(t,...e)=>{const i=1===t.length?t[0]:e.reduce(((e,s,i)=>e+(t=>{if(!0===t._$cssResult$)return t.cssText;if("number"==typeof t)return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(s)+t[i+1]),t[0]);return new o(i,t,s)},a=e?t=>t:t=>t instanceof CSSStyleSheet?(t=>{let e="";for(const s of t.cssRules)e+=s.cssText;return r(e)})(t):t,{is:l,defineProperty:c,getOwnPropertyDescriptor:h,getOwnPropertyNames:d,getOwnPropertySymbols:u,getPrototypeOf:p}=Object,v=globalThis,b=v.trustedTypes,f=b?b.emptyScript:"",g=v.reactiveElementPolyfillSupport,m=(t,e)=>t,x={toAttribute(t,e){switch(e){case Boolean:t=t?f:null;break;case Object:case Array:t=null==t?t:JSON.stringify(t)}return t},fromAttribute(t,e){let s=t;switch(e){case Boolean:s=null!==t;break;case Number:s=null===t?null:Number(t);break;case Object:case Array:try{s=JSON.parse(t)}catch(t){s=null}}return s}},y=(t,e)=>!l(t,e),w={attribute:!0,type:String,converter:x,reflect:!1,hasChanged:y};Symbol.metadata??=Symbol("metadata"),v.litPropertyMetadata??=new WeakMap;class k extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??=[]).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=w){if(e.state&&(e.attribute=!1),this._$Ei(),this.elementProperties.set(t,e),!e.noAccessor){const s=Symbol(),i=this.getPropertyDescriptor(t,s,e);void 0!==i&&c(this.prototype,t,i)}}static getPropertyDescriptor(t,e,s){const{get:i,set:o}=h(this.prototype,t)??{get(){return this[e]},set(t){this[e]=t}};return{get(){return i?.call(this)},set(e){const r=i?.call(this);o.call(this,e),this.requestUpdate(t,r,s)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??w}static _$Ei(){if(this.hasOwnProperty(m("elementProperties")))return;const t=p(this);t.finalize(),void 0!==t.l&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty(m("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(m("properties"))){const t=this.properties,e=[...d(t),...u(t)];for(const s of e)this.createProperty(s,t[s])}const t=this[Symbol.metadata];if(null!==t){const e=litPropertyMetadata.get(t);if(void 0!==e)for(const[t,s]of e)this.elementProperties.set(t,s)}this._$Eh=new Map;for(const[t,e]of this.elementProperties){const s=this._$Eu(t,e);void 0!==s&&this._$Eh.set(s,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){const e=[];if(Array.isArray(t)){const s=new Set(t.flat(1/0).reverse());for(const t of s)e.unshift(a(t))}else void 0!==t&&e.push(a(t));return e}static _$Eu(t,e){const s=e.attribute;return!1===s?void 0:"string"==typeof s?s:"string"==typeof t?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise((t=>this.enableUpdating=t)),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach((t=>t(this)))}addController(t){(this._$EO??=new Set).add(t),void 0!==this.renderRoot&&this.isConnected&&t.hostConnected?.()}removeController(t){this._$EO?.delete(t)}_$E_(){const t=new Map,e=this.constructor.elementProperties;for(const s of e.keys())this.hasOwnProperty(s)&&(t.set(s,this[s]),delete this[s]);t.size>0&&(this._$Ep=t)}createRenderRoot(){const s=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((s,i)=>{if(e)s.adoptedStyleSheets=i.map((t=>t instanceof CSSStyleSheet?t:t.styleSheet));else for(const e of i){const i=document.createElement("style"),o=t.litNonce;void 0!==o&&i.setAttribute("nonce",o),i.textContent=e.cssText,s.appendChild(i)}})(s,this.constructor.elementStyles),s}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach((t=>t.hostConnected?.()))}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach((t=>t.hostDisconnected?.()))}attributeChangedCallback(t,e,s){this._$AK(t,s)}_$EC(t,e){const s=this.constructor.elementProperties.get(t),i=this.constructor._$Eu(t,s);if(void 0!==i&&!0===s.reflect){const o=(void 0!==s.converter?.toAttribute?s.converter:x).toAttribute(e,s.type);this._$Em=t,null==o?this.removeAttribute(i):this.setAttribute(i,o),this._$Em=null}}_$AK(t,e){const s=this.constructor,i=s._$Eh.get(t);if(void 0!==i&&this._$Em!==i){const t=s.getPropertyOptions(i),o="function"==typeof t.converter?{fromAttribute:t.converter}:void 0!==t.converter?.fromAttribute?t.converter:x;this._$Em=i,this[i]=o.fromAttribute(e,t.type),this._$Em=null}}requestUpdate(t,e,s){if(void 0!==t){if(s??=this.constructor.getPropertyOptions(t),!(s.hasChanged??y)(this[t],e))return;this.P(t,e,s)}!1===this.isUpdatePending&&(this._$ES=this._$ET())}P(t,e,s){this._$AL.has(t)||this._$AL.set(t,e),!0===s.reflect&&this._$Em!==t&&(this._$Ej??=new Set).add(t)}async _$ET(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const t=this.scheduleUpdate();return null!=t&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[t,e]of this._$Ep)this[t]=e;this._$Ep=void 0}const t=this.constructor.elementProperties;if(t.size>0)for(const[e,s]of t)!0!==s.wrapped||this._$AL.has(e)||void 0===this[e]||this.P(e,this[e],s)}let t=!1;const e=this._$AL;try{t=this.shouldUpdate(e),t?(this.willUpdate(e),this._$EO?.forEach((t=>t.hostUpdate?.())),this.update(e)):this._$EU()}catch(e){throw t=!1,this._$EU(),e}t&&this._$AE(e)}willUpdate(t){}_$AE(t){this._$EO?.forEach((t=>t.hostUpdated?.())),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EU(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Ej&&=this._$Ej.forEach((t=>this._$EC(t,this[t]))),this._$EU()}updated(t){}firstUpdated(t){}}k.elementStyles=[],k.shadowRootOptions={mode:"open"},k[m("elementProperties")]=new Map,k[m("finalized")]=new Map,g?.({ReactiveElement:k}),(v.reactiveElementVersions??=[]).push("2.0.4");const $=globalThis,_=$.trustedTypes,C=_?_.createPolicy("lit-html",{createHTML:t=>t}):void 0,B="$lit$",S=`lit$${Math.random().toFixed(9).slice(2)}$`,z="?"+S,A=`<${z}>`,E=document,O=()=>E.createComment(""),j=t=>null===t||"object"!=typeof t&&"function"!=typeof t,I=Array.isArray,M="[ \t\n\f\r]",F=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,P=/-->/g,D=/>/g,N=RegExp(`>|${M}(?:([^\\s"'>=/]+)(${M}*=${M}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),V=/'/g,T=/"/g,R=/^(?:script|style|textarea|title)$/i,L=(t=>(e,...s)=>({_$litType$:t,strings:e,values:s}))(1),U=Symbol.for("lit-noChange"),q=Symbol.for("lit-nothing"),H=new WeakMap,K=E.createTreeWalker(E,129);function W(t,e){if(!I(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==C?C.createHTML(e):e}class G{constructor({strings:t,_$litType$:e},s){let i;this.parts=[];let o=0,r=0;const n=t.length-1,a=this.parts,[l,c]=((t,e)=>{const s=t.length-1,i=[];let o,r=2===e?"<svg>":3===e?"<math>":"",n=F;for(let e=0;e<s;e++){const s=t[e];let a,l,c=-1,h=0;for(;h<s.length&&(n.lastIndex=h,l=n.exec(s),null!==l);)h=n.lastIndex,n===F?"!--"===l[1]?n=P:void 0!==l[1]?n=D:void 0!==l[2]?(R.test(l[2])&&(o=RegExp("</"+l[2],"g")),n=N):void 0!==l[3]&&(n=N):n===N?">"===l[0]?(n=o??F,c=-1):void 0===l[1]?c=-2:(c=n.lastIndex-l[2].length,a=l[1],n=void 0===l[3]?N:'"'===l[3]?T:V):n===T||n===V?n=N:n===P||n===D?n=F:(n=N,o=void 0);const d=n===N&&t[e+1].startsWith("/>")?" ":"";r+=n===F?s+A:c>=0?(i.push(a),s.slice(0,c)+B+s.slice(c)+S+d):s+S+(-2===c?e:d)}return[W(t,r+(t[s]||"<?>")+(2===e?"</svg>":3===e?"</math>":"")),i]})(t,e);if(this.el=G.createElement(l,s),K.currentNode=this.el.content,2===e||3===e){const t=this.el.content.firstChild;t.replaceWith(...t.childNodes)}for(;null!==(i=K.nextNode())&&a.length<n;){if(1===i.nodeType){if(i.hasAttributes())for(const t of i.getAttributeNames())if(t.endsWith(B)){const e=c[r++],s=i.getAttribute(t).split(S),n=/([.?@])?(.*)/.exec(e);a.push({type:1,index:o,name:n[2],strings:s,ctor:"."===n[1]?Q:"?"===n[1]?tt:"@"===n[1]?et:Z}),i.removeAttribute(t)}else t.startsWith(S)&&(a.push({type:6,index:o}),i.removeAttribute(t));if(R.test(i.tagName)){const t=i.textContent.split(S),e=t.length-1;if(e>0){i.textContent=_?_.emptyScript:"";for(let s=0;s<e;s++)i.append(t[s],O()),K.nextNode(),a.push({type:2,index:++o});i.append(t[e],O())}}}else if(8===i.nodeType)if(i.data===z)a.push({type:2,index:o});else{let t=-1;for(;-1!==(t=i.data.indexOf(S,t+1));)a.push({type:7,index:o}),t+=S.length-1}o++}}static createElement(t,e){const s=E.createElement("template");return s.innerHTML=t,s}}function J(t,e,s=t,i){if(e===U)return e;let o=void 0!==i?s.o?.[i]:s.l;const r=j(e)?void 0:e._$litDirective$;return o?.constructor!==r&&(o?._$AO?.(!1),void 0===r?o=void 0:(o=new r(t),o._$AT(t,s,i)),void 0!==i?(s.o??=[])[i]=o:s.l=o),void 0!==o&&(e=J(t,o._$AS(t,e.values),o,i)),e}class Y{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){const{el:{content:e},parts:s}=this._$AD,i=(t?.creationScope??E).importNode(e,!0);K.currentNode=i;let o=K.nextNode(),r=0,n=0,a=s[0];for(;void 0!==a;){if(r===a.index){let e;2===a.type?e=new X(o,o.nextSibling,this,t):1===a.type?e=new a.ctor(o,a.name,a.strings,this,t):6===a.type&&(e=new st(o,this,t)),this._$AV.push(e),a=s[++n]}r!==a?.index&&(o=K.nextNode(),r++)}return K.currentNode=E,i}p(t){let e=0;for(const s of this._$AV)void 0!==s&&(void 0!==s.strings?(s._$AI(t,s,e),e+=s.strings.length-2):s._$AI(t[e])),e++}}let X=class t{get _$AU(){return this._$AM?._$AU??this.v}constructor(t,e,s,i){this.type=2,this._$AH=q,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=s,this.options=i,this.v=i?.isConnected??!0}get parentNode(){let t=this._$AA.parentNode;const e=this._$AM;return void 0!==e&&11===t?.nodeType&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=J(this,t,e),j(t)?t===q||null==t||""===t?(this._$AH!==q&&this._$AR(),this._$AH=q):t!==this._$AH&&t!==U&&this._(t):void 0!==t._$litType$?this.$(t):void 0!==t.nodeType?this.T(t):(t=>I(t)||"function"==typeof t?.[Symbol.iterator])(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==q&&j(this._$AH)?this._$AA.nextSibling.data=t:this.T(E.createTextNode(t)),this._$AH=t}$(t){const{values:e,_$litType$:s}=t,i="number"==typeof s?this._$AC(t):(void 0===s.el&&(s.el=G.createElement(W(s.h,s.h[0]),this.options)),s);if(this._$AH?._$AD===i)this._$AH.p(e);else{const t=new Y(i,this),s=t.u(this.options);t.p(e),this.T(s),this._$AH=t}}_$AC(t){let e=H.get(t.strings);return void 0===e&&H.set(t.strings,e=new G(t)),e}k(e){I(this._$AH)||(this._$AH=[],this._$AR());const s=this._$AH;let i,o=0;for(const r of e)o===s.length?s.push(i=new t(this.O(O()),this.O(O()),this,this.options)):i=s[o],i._$AI(r),o++;o<s.length&&(this._$AR(i&&i._$AB.nextSibling,o),s.length=o)}_$AR(t=this._$AA.nextSibling,e){for(this._$AP?.(!1,!0,e);t&&t!==this._$AB;){const e=t.nextSibling;t.remove(),t=e}}setConnected(t){void 0===this._$AM&&(this.v=t,this._$AP?.(t))}};class Z{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,s,i,o){this.type=1,this._$AH=q,this._$AN=void 0,this.element=t,this.name=e,this._$AM=i,this.options=o,s.length>2||""!==s[0]||""!==s[1]?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=q}_$AI(t,e=this,s,i){const o=this.strings;let r=!1;if(void 0===o)t=J(this,t,e,0),r=!j(t)||t!==this._$AH&&t!==U,r&&(this._$AH=t);else{const i=t;let n,a;for(t=o[0],n=0;n<o.length-1;n++)a=J(this,i[s+n],e,n),a===U&&(a=this._$AH[n]),r||=!j(a)||a!==this._$AH[n],a===q?t=q:t!==q&&(t+=(a??"")+o[n+1]),this._$AH[n]=a}r&&!i&&this.j(t)}j(t){t===q?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}}class Q extends Z{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===q?void 0:t}}class tt extends Z{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==q)}}class et extends Z{constructor(t,e,s,i,o){super(t,e,s,i,o),this.type=5}_$AI(t,e=this){if((t=J(this,t,e,0)??q)===U)return;const s=this._$AH,i=t===q&&s!==q||t.capture!==s.capture||t.once!==s.once||t.passive!==s.passive,o=t!==q&&(s===q||i);i&&this.element.removeEventListener(this.name,this,s),o&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){"function"==typeof this._$AH?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t)}}class st{constructor(t,e,s){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=s}get _$AU(){return this._$AM._$AU}_$AI(t){J(this,t)}}const it={I:X},ot=$.litHtmlPolyfillSupport;ot?.(G,X),($.litHtmlVersions??=[]).push("3.2.0");class rt extends k{constructor(){super(...arguments),this.renderOptions={host:this},this.o=void 0}createRenderRoot(){const t=super.createRenderRoot();return this.renderOptions.renderBefore??=t.firstChild,t}update(t){const e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this.o=((t,e,s)=>{const i=s?.renderBefore??e;let o=i._$litPart$;if(void 0===o){const t=s?.renderBefore??null;i._$litPart$=o=new X(e.insertBefore(O(),t),t,void 0,s??{})}return o._$AI(t),o})(e,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this.o?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this.o?.setConnected(!1)}render(){return U}}rt._$litElement$=!0,rt.finalized=!0,globalThis.litElementHydrateSupport?.({LitElement:rt});const nt=globalThis.litElementPolyfillSupport;nt?.({LitElement:rt}),(globalThis.litElementVersions??=[]).push("4.1.0");const at={attribute:!0,type:String,converter:x,reflect:!1,hasChanged:y},lt=(t=at,e,s)=>{const{kind:i,metadata:o}=s;let r=globalThis.litPropertyMetadata.get(o);if(void 0===r&&globalThis.litPropertyMetadata.set(o,r=new Map),r.set(s.name,t),"accessor"===i){const{name:i}=s;return{set(s){const o=e.get.call(this);e.set.call(this,s),this.requestUpdate(i,o,t)},init(e){return void 0!==e&&this.P(i,void 0,t),e}}}if("setter"===i){const{name:i}=s;return function(s){const o=this[i];e.call(this,s),this.requestUpdate(i,o,t)}}throw Error("Unsupported decorator location: "+i)};function ct(t){return(e,s)=>"object"==typeof s?lt(t,e,s):((t,e,s)=>{const i=e.hasOwnProperty(s);return e.constructor.createProperty(s,i?{...t,wrapped:!0}:t),i?Object.getOwnPropertyDescriptor(e,s):void 0})(t,e,s)}function ht(t){return ct({...t,state:!0,attribute:!1})}const dt=(t,e,s)=>(s.configurable=!0,s.enumerable=!0,s);function ut(t,e){return(s,i,o)=>{const r=e=>e.renderRoot?.querySelector(t)??null;if(e){const{get:t,set:e}="object"==typeof i?s:o??(()=>{const t=Symbol();return{get(){return this[t]},set(e){this[t]=e}}})();return dt(0,0,{get(){let s=t.call(this);return void 0===s&&(s=r(this),(null!==s||this.hasUpdated)&&e.call(this,s)),s}})}return dt(0,0,{get(){return r(this)}})}}let pt;function vt(t){return(e,s)=>{const{slot:i,selector:o}=t??{},r="slot"+(i?`[name=${i}]`:":not([name])");return dt(0,0,{get(){const e=this.renderRoot?.querySelector(r),s=e?.assignedElements(t)??[];return void 0===o?s:s.filter((t=>t.matches(o)))}})}}const bt="1.14.0",ft="__vscodeElements_disableRegistryWarning__";class gt extends rt{get version(){return bt}}const mt=t=>e=>{if(!customElements.get(t))return void customElements.define(t,e);if(ft in window)return;const s=document.createElement(t),i=s?.version;let o="";i?i!==bt?(o+="is already registered by a different version of VSCode Elements. ",o+=`This version is "${bt}", while the other one is "${i}".`):o+="is already registered by the same version of VSCode Elements. ":(console.warn(t,"is already registered by an unknown custom element handler class."),o+="is already registered by an unknown custom element handler class."),console.warn(`[VSCode Elements] ${t} ${o}\nTo suppress this warning, set window.${ft} to true`)};var xt=n`
  :host([hidden]) {
    display: none;
  }

  :host([disabled]),
  :host(:disabled) {
    cursor: not-allowed;
    opacity: 0.4;
    pointer-events: none;
  }
`;function yt(){return navigator.userAgent.indexOf("Linux")>-1?'system-ui, "Ubuntu", "Droid Sans", sans-serif':navigator.userAgent.indexOf("Mac")>-1?"-apple-system, BlinkMacSystemFont, sans-serif":navigator.userAgent.indexOf("Windows")>-1?'"Segoe WPC", "Segoe UI", sans-serif':"sans-serif"}const wt=[xt,n`
    :host {
      background-color: var(--vscode-badge-background, #616161);
      border: 1px solid var(--vscode-contrastBorder, transparent);
      border-radius: 2px;
      box-sizing: border-box;
      color: var(--vscode-badge-foreground, #f8f8f8);
      display: inline-block;
      font-family: var(--vscode-font-family, ${r(yt())});
      font-size: 11px;
      font-weight: 400;
      line-height: 14px;
      min-width: 18px;
      padding: 2px 3px;
      text-align: center;
      white-space: nowrap;
    }

    :host([variant='counter']) {
      border-radius: 11px;
      line-height: 11px;
      min-height: 18px;
      min-width: 18px;
      padding: 3px 6px;
    }

    :host([variant='activity-bar-counter']) {
      background-color: var(--vscode-activityBarBadge-background, #0078d4);
      border-radius: 20px;
      color: var(--vscode-activityBarBadge-foreground, #ffffff);
      font-size: 9px;
      font-weight: 600;
      line-height: 16px;
      padding: 0 4px;
    }

    :host([variant='tab-header-counter']) {
      background-color: var(--vscode-activityBarBadge-background, #0078d4);
      border-radius: 10px;
      color: var(--vscode-activityBarBadge-foreground, #ffffff);
      line-height: 10px;
      min-height: 16px;
      min-width: 16px;
      padding: 3px 5px;
    }
  `];var kt=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let $t=class extends gt{constructor(){super(...arguments),this.variant="default"}render(){return L` <slot></slot> `}};$t.styles=wt,kt([ct({reflect:!0})],$t.prototype,"variant",void 0),$t=kt([mt("vscode-badge")],$t);const _t=1,Ct=2,Bt=3,St=t=>(...e)=>({_$litDirective$:t,values:e});class zt{constructor(t){}get _$AU(){return this._$AM._$AU}_$AT(t,e,s){this.t=t,this._$AM=e,this.i=s}_$AS(t,e){return this.update(t,e)}update(t,e){return this.render(...e)}}const At=St(class extends zt{constructor(t){if(super(t),t.type!==_t||"class"!==t.name||t.strings?.length>2)throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(t){return" "+Object.keys(t).filter((e=>t[e])).join(" ")+" "}update(t,[e]){if(void 0===this.st){this.st=new Set,void 0!==t.strings&&(this.nt=new Set(t.strings.join(" ").split(/\s/).filter((t=>""!==t))));for(const t in e)e[t]&&!this.nt?.has(t)&&this.st.add(t);return this.render(e)}const s=t.element.classList;for(const t of this.st)t in e||(s.remove(t),this.st.delete(t));for(const t in e){const i=!!e[t];i===this.st.has(t)||this.nt?.has(t)||(i?(s.add(t),this.st.add(t)):(s.remove(t),this.st.delete(t)))}return U}}),Et=t=>t??q;const Ot=St(class extends zt{constructor(t){if(super(t),this._prevProperties={},t.type!==Bt||"style"!==t.name)throw new Error("The `stylePropertyMap` directive must be used in the `style` property")}update(t,[e]){return Object.entries(e).forEach((([e,s])=>{this._prevProperties[e]!==s&&(e.startsWith("--")?t.element.style.setProperty(e,s):t.element.style[e]=s,this._prevProperties[e]=s)})),U}render(t){return U}}),jt=[xt,n`
    :host {
      color: var(--vscode-icon-foreground, #cccccc);
      display: inline-block;
    }

    .codicon[class*='codicon-'] {
      display: block;
    }

    .icon,
    .button {
      background-color: transparent;
      display: block;
      padding: 0;
    }

    .button {
      border-color: transparent;
      border-style: solid;
      border-width: 1px;
      border-radius: 5px;
      color: currentColor;
      cursor: pointer;
      padding: 2px;
    }

    .button:hover {
      background-color: var(
        --vscode-toolbar-hoverBackground,
        rgba(90, 93, 94, 0.31)
      );
    }

    .button:active {
      background-color: var(
        --vscode-toolbar-activeBackground,
        rgba(99, 102, 103, 0.31)
      );
    }

    .button:focus {
      outline: none;
    }

    .button:focus-visible {
      border-color: var(--vscode-focusBorder, #0078d4);
    }

    @keyframes icon-spin {
      100% {
        transform: rotate(360deg);
      }
    }

    .spin {
      animation-name: icon-spin;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    }
  `];var It,Mt=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Ft=It=class extends gt{constructor(){super(...arguments),this.label="",this.name="",this.size=16,this.spin=!1,this.spinDuration=1.5,this.actionIcon=!1,this._onButtonClick=t=>{this.dispatchEvent(new CustomEvent("vsc-click",{detail:{originalEvent:t}}))}}connectedCallback(){super.connectedCallback();const{href:t,nonce:e}=this._getStylesheetConfig();It.stylesheetHref=t,It.nonce=e}_getStylesheetConfig(){const t=document.getElementById("vscode-codicon-stylesheet"),e=t?.getAttribute("href")||void 0,s=t?.nonce||void 0;if(!t){let t="[VSCode Elements] To use the Icon component, the codicons.css file must be included in the page with the id `vscode-codicon-stylesheet`! ";t+="See https://vscode-elements.github.io/components/icon/ for more details.",console.warn(t)}return{nonce:s,href:e}}render(){const{stylesheetHref:t,nonce:e}=It,s=L`<span
      class=${At({codicon:!0,["codicon-"+this.name]:!0,spin:this.spin})}
      .style=${Ot({animationDuration:String(this.spinDuration)+"s",fontSize:this.size+"px",height:this.size+"px",width:this.size+"px"})}
    ></span>`,i=this.actionIcon?L` <button
          class="button"
          @click=${this._onButtonClick}
          aria-label=${this.label}
        >
          ${s}
        </button>`:L` <span class="icon" aria-hidden="true" role="presentation"
          >${s}</span
        >`;return L`
      <link
        rel="stylesheet"
        href=${Et(t)}
        nonce=${Et(e)}
      >
      ${i}
    `}};Ft.styles=jt,Ft.stylesheetHref="",Ft.nonce="",Mt([ct()],Ft.prototype,"label",void 0),Mt([ct({type:String})],Ft.prototype,"name",void 0),Mt([ct({type:Number})],Ft.prototype,"size",void 0),Mt([ct({type:Boolean,reflect:!0})],Ft.prototype,"spin",void 0),Mt([ct({type:Number,attribute:"spin-duration"})],Ft.prototype,"spinDuration",void 0),Mt([ct({type:Boolean,reflect:!0,attribute:"action-icon"})],Ft.prototype,"actionIcon",void 0),Ft=It=Mt([mt("vscode-icon")],Ft);const Pt=[xt,n`
    :host {
      background-color: var(--vscode-button-background, #0078d4);
      border-color: var(--vscode-button-border, transparent);
      border-style: solid;
      border-radius: 2px;
      border-width: 1px;
      color: var(--vscode-button-foreground, #ffffff);
      cursor: pointer;
      display: inline-block;
      font-family: var(--vscode-font-family, ${r(yt())});
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 22px;
      overflow: hidden;
      padding: 1px 13px;
      user-select: none;
      white-space: nowrap;
    }

    :host([secondary]) {
      color: var(--vscode-button-secondaryForeground, #cccccc);
      background-color: var(--vscode-button-secondaryBackground, #313131);
      border-color: var(
        --vscode-button-border,
        var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.07))
      );
    }

    :host([disabled]) {
      cursor: default;
      opacity: 0.4;
      pointer-events: none;
    }

    :host(:hover) {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
    }

    :host([disabled]:hover) {
      background-color: var(--vscode-button-background, #0078d4);
    }

    :host([secondary]:hover) {
      background-color: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
    }

    :host([secondary][disabled]:hover) {
      background-color: var(--vscode-button-secondaryBackground, #313131);
    }

    :host(:focus),
    :host(:active) {
      outline: none;
    }

    :host(:focus) {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: 2px;
    }

    :host([disabled]:focus) {
      background-color: var(--vscode-button-background, #0078d4);
      outline: 0;
    }

    :host([secondary]:focus) {
      background-color: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
    }

    :host([secondary][disabled]:focus) {
      background-color: var(--vscode-button-secondaryBackground, #313131);
    }

    ::slotted(*) {
      display: inline-block;
      margin-left: 4px;
      margin-right: 4px;
    }

    ::slotted(*:first-child) {
      margin-left: 0;
    }

    ::slotted(vscode-icon) {
      color: inherit;
    }

    .wrapper {
      align-items: center;
      box-sizing: border-box;
      display: flex;
      justify-content: center;
      position: relative;
      width: 100%;
    }

    slot {
      align-items: center;
      display: flex;
      height: 100%;
    }

    .icon {
      color: inherit;
      display: block;
      margin-right: 3px;
    }

    .icon-after {
      color: inherit;
      display: block;
      margin-left: 3px;
    }
  `];var Dt=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Nt=class extends gt{get form(){return this._internals.form}constructor(){super(),this.autofocus=!1,this.tabIndex=0,this.secondary=!1,this.role="button",this.disabled=!1,this.icon="",this.iconSpin=!1,this.iconAfter="",this.iconAfterSpin=!1,this.focused=!1,this.name=void 0,this.type="button",this.value="",this._prevTabindex=0,this._handleFocus=()=>{this.focused=!0},this._handleBlur=()=>{this.focused=!1},this.addEventListener("keydown",this._handleKeyDown.bind(this)),this.addEventListener("click",this._handleClick.bind(this)),this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.autofocus&&(this.tabIndex<0&&(this.tabIndex=0),this.updateComplete.then((()=>{this.focus(),this.requestUpdate()}))),this.addEventListener("focus",this._handleFocus),this.addEventListener("blur",this._handleBlur)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("focus",this._handleFocus),this.removeEventListener("blur",this._handleBlur)}update(t){super.update(t),t.has("value")&&this._internals.setFormValue(this.value),t.has("disabled")&&(this.disabled?(this._prevTabindex=this.tabIndex,this.tabIndex=-1):this.tabIndex=this._prevTabindex)}_executeAction(){"submit"===this.type&&this._internals.form&&this._internals.form.requestSubmit(),"reset"===this.type&&this._internals.form&&this._internals.form.reset()}_handleKeyDown(t){if(("Enter"===t.key||" "===t.key)&&!this.hasAttribute("disabled")){this.dispatchEvent(new CustomEvent("vsc-click",{detail:{originalEvent:new MouseEvent("click")}}));const t=new MouseEvent("click",{bubbles:!0,cancelable:!0});t.synthetic=!0,this.dispatchEvent(t),this._executeAction()}}_handleClick(t){t.synthetic||this.hasAttribute("disabled")||(this.dispatchEvent(new CustomEvent("vsc-click",{detail:{originalEvent:t}})),this._executeAction())}render(){const t=""!==this.icon,e=""!==this.iconAfter,s={wrapper:!0,"has-icon-before":t,"has-icon-after":e},i=t?L`<vscode-icon
          name=${this.icon}
          ?spin=${this.iconSpin}
          spin-duration=${Et(this.iconSpinDuration)}
          class="icon"
        ></vscode-icon>`:q,o=e?L`<vscode-icon
          name=${this.iconAfter}
          ?spin=${this.iconAfterSpin}
          spin-duration=${Et(this.iconAfterSpinDuration)}
          class="icon-after"
        ></vscode-icon>`:q;return L`
      <span class=${At(s)}>
        ${i}
        <slot></slot>
        ${o}
      </span>
    `}};Nt.styles=Pt,Nt.formAssociated=!0,Dt([ct({type:Boolean,reflect:!0})],Nt.prototype,"autofocus",void 0),Dt([ct({type:Number,reflect:!0})],Nt.prototype,"tabIndex",void 0),Dt([ct({type:Boolean,reflect:!0})],Nt.prototype,"secondary",void 0),Dt([ct({reflect:!0})],Nt.prototype,"role",void 0),Dt([ct({type:Boolean,reflect:!0})],Nt.prototype,"disabled",void 0),Dt([ct()],Nt.prototype,"icon",void 0),Dt([ct({type:Boolean,reflect:!0,attribute:"icon-spin"})],Nt.prototype,"iconSpin",void 0),Dt([ct({type:Number,reflect:!0,attribute:"icon-spin-duration"})],Nt.prototype,"iconSpinDuration",void 0),Dt([ct({attribute:"icon-after"})],Nt.prototype,"iconAfter",void 0),Dt([ct({type:Boolean,reflect:!0,attribute:"icon-after-spin"})],Nt.prototype,"iconAfterSpin",void 0),Dt([ct({type:Number,reflect:!0,attribute:"icon-after-spin-duration"})],Nt.prototype,"iconAfterSpinDuration",void 0),Dt([ct({type:Boolean,reflect:!0})],Nt.prototype,"focused",void 0),Dt([ct({type:String,reflect:!0})],Nt.prototype,"name",void 0),Dt([ct({reflect:!0})],Nt.prototype,"type",void 0),Dt([ct()],Nt.prototype,"value",void 0),Nt=Dt([mt("vscode-button")],Nt);var Vt=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};class Tt extends gt{constructor(){super(),this.focused=!1,this._prevTabindex=0,this._handleFocus=()=>{this.focused=!0},this._handleBlur=()=>{this.focused=!1}}connectedCallback(){super.connectedCallback(),this.addEventListener("focus",this._handleFocus),this.addEventListener("blur",this._handleBlur)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("focus",this._handleFocus),this.removeEventListener("blur",this._handleBlur)}attributeChangedCallback(t,e,s){super.attributeChangedCallback(t,e,s),"disabled"===t&&this.hasAttribute("disabled")?(this._prevTabindex=this.tabIndex,this.tabIndex=-1):"disabled"!==t||this.hasAttribute("disabled")||(this.tabIndex=this._prevTabindex)}}Vt([ct({type:Boolean,reflect:!0})],Tt.prototype,"focused",void 0);var Rt=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};const Lt=t=>{class e extends t{constructor(){super(...arguments),this._label="",this._slottedText=""}set label(t){this._label=t,""===this._slottedText&&this.setAttribute("aria-label",t)}get label(){return this._label}_handleSlotChange(){this._slottedText=this.textContent?this.textContent.trim():"",""!==this._slottedText&&this.setAttribute("aria-label",this._slottedText)}_renderLabelAttribute(){return""===this._slottedText?L`<span class="label-attr">${this._label}</span>`:L`${q}`}}return Rt([ct()],e.prototype,"label",null),e};var Ut=[n`
    :host {
      color: var(--vscode-foreground, #cccccc);
      display: inline-block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 18px;
    }

    :host(:focus) {
      outline: none;
    }

    :host([disabled]) {
      opacity: 0.4;
    }

    .wrapper {
      cursor: pointer;
      display: block;
      font-size: var(--vscode-font-size, 13px);
      margin-bottom: 4px;
      margin-top: 4px;
      min-height: 18px;
      position: relative;
      user-select: none;
    }

    :host([disabled]) .wrapper {
      cursor: default;
    }

    input {
      position: absolute;
      height: 1px;
      left: 9px;
      margin: 0;
      top: 17px;
      width: 1px;
      overflow: hidden;
      clip: rect(1px, 1px, 1px, 1px);
      white-space: nowrap;
    }

    .icon {
      align-items: center;
      background-color: var(--vscode-settings-checkboxBackground, #313131);
      background-size: 16px;
      border: 1px solid var(--vscode-settings-checkboxBorder, #3c3c3c);
      box-sizing: border-box;
      color: var(--vscode-settings-checkboxForeground, #cccccc);
      display: flex;
      height: 18px;
      justify-content: center;
      left: 0;
      margin-left: 0;
      margin-right: 9px;
      padding: 0;
      pointer-events: none;
      position: absolute;
      top: 0;
      width: 18px;
    }

    .icon.before-empty-label {
      margin-right: 0;
    }

    .label {
      cursor: pointer;
      display: block;
      min-height: 18px;
      min-width: 18px;
    }

    .label-inner {
      display: block;
      opacity: 0.9;
      padding-left: 27px;
    }

    .label-inner.empty {
      padding-left: 0;
    }

    :host([disabled]) .label {
      cursor: default;
    }
  `];const qt=[xt,Ut,n`
    :host(:invalid) .icon,
    :host([invalid]) .icon {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    .icon {
      border-radius: 3px;
    }

    .indeterminate-icon {
      background-color: currentColor;
      position: absolute;
      height: 1px;
      width: 12px;
    }

    :host(:focus):host(:not([disabled])) .icon {
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: -1px;
    }
  `];var Ht=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Kt=class extends(Lt(Tt)){set checked(t){this._checked=t,this._manageRequired(),this.requestUpdate()}get checked(){return this._checked}set required(t){this._required=t,this._manageRequired(),this.requestUpdate()}get required(){return this._required}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}constructor(){super(),this.autofocus=!1,this._checked=!1,this.defaultChecked=!1,this.invalid=!1,this.name=void 0,this.role="checkbox",this.value="",this.disabled=!1,this.indeterminate=!1,this._required=!1,this.type="checkbox",this._handleClick=t=>{t.preventDefault(),this.disabled||this._toggleState()},this._handleKeyDown=t=>{this.disabled||"Enter"!==t.key&&" "!==t.key||(t.preventDefault()," "===t.key&&this._toggleState(),"Enter"===t.key&&this._internals.form?.requestSubmit())},this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._handleKeyDown),this.updateComplete.then((()=>{this._manageRequired(),this._setActualFormValue()}))}disconnectedCallback(){this.removeEventListener("keydown",this._handleKeyDown)}update(t){super.update(t),t.has("checked")&&(this.ariaChecked=this.checked?"true":"false")}formResetCallback(){this.checked=this.defaultChecked}formStateRestoreCallback(t,e){t&&(this.checked=!0)}_setActualFormValue(){let t="";t=this.checked?this.value?this.value:"on":null,this._internals.setFormValue(t)}_toggleState(){this.checked=!this.checked,this.indeterminate=!1,this._setActualFormValue(),this._manageRequired(),this.dispatchEvent(new Event("change",{bubbles:!0})),this.dispatchEvent(new CustomEvent("vsc-change",{detail:{checked:this.checked,label:this.label,value:this.value},bubbles:!0,composed:!0}))}_manageRequired(){!this.checked&&this.required?this._internals.setValidity({valueMissing:!0},"Please check this box if you want to proceed.",this._inputEl??void 0):this._internals.setValidity({})}render(){const t=At({icon:!0,checked:this.checked,indeterminate:this.indeterminate}),e=At({"label-inner":!0}),s=L`<svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      class="check-icon"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z"
      />
    </svg>`,i=this.checked&&!this.indeterminate?s:q,o=this.indeterminate?L`<span class="indeterminate-icon"></span>`:q;return L`
      <div class="wrapper">
        <input
          ?autofocus=${this.autofocus}
          id="input"
          class="checkbox"
          type="checkbox"
          ?checked=${this.checked}
          value=${this.value}
        >
        <div class=${t}>${o}${i}</div>
        <label for="input" class="label" @click=${this._handleClick}>
          <span class=${e}>
            ${this._renderLabelAttribute()}
            <slot @slotchange=${this._handleSlotChange}></slot>
          </span>
        </label>
      </div>
    `}};Kt.styles=qt,Kt.formAssociated=!0,Kt.shadowRootOptions={...rt.shadowRootOptions,delegatesFocus:!0},Ht([ct({type:Boolean,reflect:!0})],Kt.prototype,"autofocus",void 0),Ht([ct({type:Boolean,reflect:!0})],Kt.prototype,"checked",null),Ht([ct({type:Boolean,reflect:!0,attribute:"default-checked"})],Kt.prototype,"defaultChecked",void 0),Ht([ct({type:Boolean,reflect:!0})],Kt.prototype,"invalid",void 0),Ht([ct({reflect:!0})],Kt.prototype,"name",void 0),Ht([ct({reflect:!0})],Kt.prototype,"role",void 0),Ht([ct()],Kt.prototype,"value",void 0),Ht([ct({type:Boolean,reflect:!0})],Kt.prototype,"disabled",void 0),Ht([ct({type:Boolean,reflect:!0})],Kt.prototype,"indeterminate",void 0),Ht([ct({type:Boolean,reflect:!0})],Kt.prototype,"required",null),Ht([ct()],Kt.prototype,"type",void 0),Ht([ut("#input")],Kt.prototype,"_inputEl",void 0),Kt=Ht([mt("vscode-checkbox")],Kt);const Wt=[xt,n`
    :host {
      display: block;
    }

    .wrapper {
      display: flex;
      flex-wrap: wrap;
    }

    :host([variant='vertical']) .wrapper {
      display: block;
    }

    ::slotted(vscode-checkbox) {
      margin-right: 20px;
    }

    ::slotted(vscode-checkbox:last-child) {
      margin-right: 0;
    }

    :host([variant='vertical']) ::slotted(vscode-checkbox) {
      display: block;
      margin-bottom: 15px;
    }

    :host([variant='vertical']) ::slotted(vscode-checkbox:last-child) {
      margin-bottom: 0;
    }
  `];var Gt=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Jt=class extends gt{constructor(){super(...arguments),this.role="group",this.variant="horizontal"}render(){return L`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};Jt.styles=Wt,Gt([ct({reflect:!0})],Jt.prototype,"role",void 0),Gt([ct({reflect:!0})],Jt.prototype,"variant",void 0),Jt=Gt([mt("vscode-checkbox-group")],Jt);const Yt=[xt,n`
    .collapsible {
      background-color: var(--vscode-sideBar-background, #181818);
    }

    .collapsible-header {
      align-items: center;
      background-color: var(--vscode-sideBarSectionHeader-background, #181818);
      cursor: pointer;
      display: flex;
      height: 22px;
      line-height: 22px;
      user-select: none;
    }

    .collapsible-header:focus {
      opacity: 1;
      outline-offset: -1px;
      outline-style: solid;
      outline-width: 1px;
      outline-color: var(--vscode-focusBorder, #0078d4);
    }

    .title {
      color: var(--vscode-sideBarTitle-foreground, #cccccc);
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 11px;
      font-weight: 700;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .title .description {
      font-weight: 400;
      margin-left: 10px;
      text-transform: none;
      opacity: 0.6;
    }

    .header-icon {
      color: var(--vscode-icon-foreground, #cccccc);
      display: block;
      flex-shrink: 0;
      margin: 0 3px;
    }

    .collapsible.open .header-icon {
      transform: rotate(90deg);
    }

    .header-slots {
      align-items: center;
      display: flex;
      height: 22px;
      margin-left: auto;
      margin-right: 4px;
    }

    .actions {
      display: none;
    }

    .collapsible.open .actions {
      display: block;
    }

    .header-slots slot {
      display: flex;
      max-height: 22px;
      overflow: hidden;
    }

    .header-slots slot::slotted(div) {
      align-items: center;
      display: flex;
    }

    .collapsible-body {
      display: none;
      overflow: hidden;
    }

    .collapsible.open .collapsible-body {
      display: block;
    }
  `];var Xt=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Zt=class extends gt{constructor(){super(...arguments),this.title="",this.description="",this.open=!1}_emitToggleEvent(){this.dispatchEvent(new CustomEvent("vsc-collapsible-toggle",{detail:{open:this.open}}))}_onHeaderClick(){this.open=!this.open,this._emitToggleEvent()}_onHeaderKeyDown(t){"Enter"===t.key&&(this.open=!this.open,this._emitToggleEvent())}render(){const t=At({collapsible:!0,open:this.open}),e=L`<svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      class="header-icon"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"
      />
    </svg>`,s=this.description?L`<span class="description">${this.description}</span>`:q;return L`
      <div class=${t}>
        <div
          class="collapsible-header"
          tabindex="0"
          title=${this.title}
          @click=${this._onHeaderClick}
          @keydown=${this._onHeaderKeyDown}
        >
          ${e}
          <h3 class="title">${this.title}${s}</h3>
          <div class="header-slots">
            <div class="actions"><slot name="actions"></slot></div>
            <div class="decorations"><slot name="decorations"></slot></div>
          </div>
        </div>
        <div class="collapsible-body" part="body">
          <slot></slot>
        </div>
      </div>
    `}};Zt.styles=Yt,Xt([ct({type:String})],Zt.prototype,"title",void 0),Xt([ct()],Zt.prototype,"description",void 0),Xt([ct({type:Boolean,reflect:!0})],Zt.prototype,"open",void 0),Zt=Xt([mt("vscode-collapsible")],Zt);const Qt=[xt,n`
    :host {
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 1.4em;
      outline: none;
      position: relative;
    }

    .context-menu-item {
      background-color: var(--vscode-menu-background, #1f1f1f);
      color: var(--vscode-menu-foreground, #cccccc);
      display: flex;
      user-select: none;
      white-space: nowrap;
    }

    .ruler {
      border-bottom: 1px solid var(--vscode-menu-separatorBackground, #454545);
      display: block;
      margin: 0 0 4px;
      padding-top: 4px;
      width: 100%;
    }

    .context-menu-item a {
      align-items: center;
      border-color: transparent;
      border-radius: 3px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-menu-foreground, #cccccc);
      cursor: pointer;
      display: flex;
      flex: 1 1 auto;
      height: 2em;
      margin-left: 4px;
      margin-right: 4px;
      outline: none;
      position: relative;
      text-decoration: inherit;
    }

    :host([selected]) .context-menu-item a {
      background-color: var(--vscode-menu-selectionBackground, #0078d4);
      border-color: var(--vscode-menu-selectionBorder, transparent);
      color: var(--vscode-menu-selectionForeground, #ffffff);
    }

    .label {
      background: none;
      display: flex;
      flex: 1 1 auto;
      font-size: 12px;
      line-height: 1;
      padding: 0 22px;
      text-decoration: none;
    }

    .keybinding {
      display: block;
      flex: 2 1 auto;
      line-height: 1;
      padding: 0 22px;
      text-align: right;
    }
  `];var te=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let ee=class extends gt{constructor(){super(...arguments),this.label="",this.keybinding="",this.value="",this.separator=!1,this.tabindex=0}onItemClick(){this.dispatchEvent(new CustomEvent("vsc-click",{detail:{label:this.label,keybinding:this.keybinding,value:this.value||this.label,separator:this.separator,tabindex:this.tabindex},bubbles:!0,composed:!0}))}render(){return L`
      ${this.separator?L`
            <div class="context-menu-item separator">
              <span class="ruler"></span>
            </div>
          `:L`
            <div class="context-menu-item">
              <a @click=${this.onItemClick}>
                ${this.label?L`<span class="label">${this.label}</span>`:q}
                ${this.keybinding?L`<span class="keybinding">${this.keybinding}</span>`:q}
              </a>
            </div>
          `}
    `}};ee.styles=Qt,te([ct({type:String})],ee.prototype,"label",void 0),te([ct({type:String})],ee.prototype,"keybinding",void 0),te([ct({type:String})],ee.prototype,"value",void 0),te([ct({type:Boolean,reflect:!0})],ee.prototype,"separator",void 0),te([ct({type:Number})],ee.prototype,"tabindex",void 0),ee=te([mt("vscode-context-menu-item")],ee);const se=[xt,n`
    :host {
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 1.4em;
      position: relative;
    }

    .context-menu {
      background-color: var(--vscode-menu-background, #1f1f1f);
      border-color: var(--vscode-menu-border, #454545);
      border-radius: 5px;
      border-style: solid;
      border-width: 1px;
      box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
      color: var(--vscode-menu-foreground, #cccccc);
      padding: 4px 0;
      white-space: nowrap;
    }

    .context-menu:focus {
      outline: 0;
    }
  `];var ie=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let oe=class extends gt{set data(t){this._data=t;const e=[];t.forEach(((t,s)=>{t.separator||e.push(s)})),this._clickableItemIndexes=e}get data(){return this._data}set show(t){this._show=t,this._selectedClickableItemIndex=-1,t&&this.updateComplete.then((()=>{this._wrapperEl&&this._wrapperEl.focus(),requestAnimationFrame((()=>{document.addEventListener("click",this._onClickOutsideBound,{once:!0})}))}))}get show(){return this._show}constructor(){super(),this.preventClose=!1,this.tabIndex=0,this._selectedClickableItemIndex=-1,this._show=!1,this._data=[],this._clickableItemIndexes=[],this._onClickOutsideBound=this._onClickOutside.bind(this),this.addEventListener("keydown",this._onKeyDown)}_onClickOutside(t){t.composedPath().includes(this)||(this.show=!1)}_onKeyDown(t){const{key:e}=t;switch("ArrowUp"!==e&&"ArrowDown"!==e&&"Escape"!==e&&"Enter"!==e||t.preventDefault(),e){case"ArrowUp":this._handleArrowUp();break;case"ArrowDown":this._handleArrowDown();break;case"Escape":this._handleEscape();break;case"Enter":this._handleEnter()}}_handleArrowUp(){0===this._selectedClickableItemIndex?this._selectedClickableItemIndex=this._clickableItemIndexes.length-1:this._selectedClickableItemIndex-=1}_handleArrowDown(){this._selectedClickableItemIndex+1<this._clickableItemIndexes.length?this._selectedClickableItemIndex+=1:this._selectedClickableItemIndex=0}_handleEscape(){this.show=!1,document.removeEventListener("click",this._onClickOutsideBound)}_dispatchSelectEvent(t){const{keybinding:e,label:s,value:i,separator:o,tabindex:r}=t;this.dispatchEvent(new CustomEvent("vsc-context-menu-select",{detail:{keybinding:e,label:s,separator:o,tabindex:r,value:i}}))}_dispatchLegacySelectEvent(t){const{keybinding:e,label:s,value:i,separator:o,tabindex:r}=t,n={keybinding:e,label:s,value:i,separator:o,tabindex:r};this.dispatchEvent(new CustomEvent("vsc-select",{detail:n,bubbles:!0,composed:!0}))}_handleEnter(){if(-1===this._selectedClickableItemIndex)return;const t=this._clickableItemIndexes[this._selectedClickableItemIndex],e=this._wrapperEl.querySelectorAll("vscode-context-menu-item")[t];this._dispatchLegacySelectEvent(e),this._dispatchSelectEvent(e),this.preventClose||(this.show=!1,document.removeEventListener("click",this._onClickOutsideBound))}_onItemClick(t){const e=t.currentTarget;this._dispatchLegacySelectEvent(e),this._dispatchSelectEvent(e),this.preventClose||(this.show=!1)}_onItemMouseOver(t){const e=t.target,s=e.dataset.index?+e.dataset.index:-1,i=this._clickableItemIndexes.findIndex((t=>t===s));-1!==i&&(this._selectedClickableItemIndex=i)}_onItemMouseOut(){this._selectedClickableItemIndex=-1}render(){if(!this._show)return L`${q}`;const t=this._clickableItemIndexes[this._selectedClickableItemIndex];return L`
      <div class="context-menu" tabindex="0">
        ${this.data?this.data.map((({label:e="",keybinding:s="",value:i="",separator:o=!1,tabindex:r=0},n)=>L`
                <vscode-context-menu-item
                  label=${e}
                  keybinding=${s}
                  value=${i}
                  ?separator=${o}
                  ?selected=${n===t}
                  tabindex=${r}
                  @vsc-click=${this._onItemClick}
                  @mouseover=${this._onItemMouseOver}
                  @mouseout=${this._onItemMouseOut}
                  data-index=${n}
                ></vscode-context-menu-item>
              `)):L`<slot></slot>`}
      </div>
    `}};oe.styles=se,ie([ct({type:Array,attribute:!1})],oe.prototype,"data",null),ie([ct({type:Boolean,reflect:!0,attribute:"prevent-close"})],oe.prototype,"preventClose",void 0),ie([ct({type:Boolean,reflect:!0})],oe.prototype,"show",null),ie([ct({type:Number,reflect:!0})],oe.prototype,"tabIndex",void 0),ie([ht()],oe.prototype,"_selectedClickableItemIndex",void 0),ie([ht()],oe.prototype,"_show",void 0),ie([ut(".context-menu")],oe.prototype,"_wrapperEl",void 0),oe=ie([mt("vscode-context-menu")],oe);const re=[xt,n`
    :host {
      background-color: var(--vscode-foreground, #cccccc);
      display: block;
      height: 1px;
      margin-bottom: 10px;
      margin-top: 10px;
      opacity: 0.4;
    }
  `];var ne=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let ae=class extends gt{constructor(){super(...arguments),this.role="separator"}render(){return L``}};ae.styles=re,ne([ct({reflect:!0})],ae.prototype,"role",void 0),ae=ne([mt("vscode-divider")],ae);const le=[xt,n`
    :host {
      display: block;
      max-width: 727px;
    }
  `];var ce,he=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};!function(t){t.HORIZONTAL="horizontal",t.VERTICAL="vertical"}(ce||(ce={}));const de=t=>"vscode-checkbox"===t.tagName.toLocaleLowerCase(),ue=t=>"vscode-radio"===t.tagName.toLocaleLowerCase();let pe=class extends gt{constructor(){super(...arguments),this.breakpoint=490,this._responsive=!1,this._firstUpdateComplete=!1,this._resizeObserverCallbackBound=this._resizeObserverCallback.bind(this)}set responsive(t){this._responsive=t,this._firstUpdateComplete&&(t?this._activateResponsiveLayout():this._deactivateResizeObserver())}get responsive(){return this._responsive}get data(){return this._collectFormData()}_collectFormData(){const t=["vscode-textfield","vscode-textarea","vscode-single-select","vscode-multi-select","vscode-checkbox","vscode-radio"].join(","),e=this.querySelectorAll(t),s={};return e.forEach((t=>{if(!t.hasAttribute("name"))return;const e=t.getAttribute("name");e&&(de(t)&&t.checked?s[e]=Array.isArray(s[e])?[...s[e],t.value]:[t.value]:"vscode-multi-select"===t.tagName.toLocaleLowerCase()?s[e]=t.value:de(t)&&!t.checked?s[e]=Array.isArray(s[e])?s[e]:[]:ue(t)&&t.checked||(t=>["vscode-textfield","vscode-textarea"].includes(t.tagName.toLocaleLowerCase()))(t)||(t=>"vscode-single-select"===t.tagName.toLocaleLowerCase())(t)?s[e]=t.value:ue(t)&&!t.checked&&(s[e]=s[e]?s[e]:""))})),s}_toggleCompactLayout(t){this._assignedFormGroups.forEach((e=>{e.dataset.originalVariant||(e.dataset.originalVariant=e.variant);const s=e.dataset.originalVariant;t===ce.VERTICAL&&"horizontal"===s?e.variant="vertical":e.variant=s;e.querySelectorAll("vscode-checkbox-group, vscode-radio-group").forEach((e=>{e.dataset.originalVariant||(e.dataset.originalVariant=e.variant);const s=e.dataset.originalVariant;t===ce.HORIZONTAL&&s===ce.HORIZONTAL?e.variant="horizontal":e.variant="vertical"}))}))}_resizeObserverCallback(t){let e=0;for(const s of t)e=s.contentRect.width;const s=e<this.breakpoint?ce.VERTICAL:ce.HORIZONTAL;s!==this._currentFormGroupLayout&&(this._toggleCompactLayout(s),this._currentFormGroupLayout=s)}_activateResponsiveLayout(){this._resizeObserver=new ResizeObserver(this._resizeObserverCallbackBound),this._resizeObserver.observe(this._wrapperElement)}_deactivateResizeObserver(){this._resizeObserver?.disconnect(),this._resizeObserver=null}firstUpdated(){this._firstUpdateComplete=!0,this._responsive&&this._activateResponsiveLayout()}render(){return L`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};pe.styles=le,he([ct({type:Boolean,reflect:!0})],pe.prototype,"responsive",null),he([ct({type:Number})],pe.prototype,"breakpoint",void 0),he([ct({type:Object})],pe.prototype,"data",null),he([ut(".wrapper")],pe.prototype,"_wrapperElement",void 0),he([vt({selector:"vscode-form-group"})],pe.prototype,"_assignedFormGroups",void 0),pe=he([mt("vscode-form-container")],pe);const ve=[xt,n`
    :host {
      --label-right-margin: 14px;
      --label-width: 150px;

      display: block;
      margin: 15px 0;
    }

    :host([variant='settings-group']) {
      margin: 0;
      padding: 12px 14px 18px;
      max-width: 727px;
    }

    .wrapper {
      display: flex;
      flex-wrap: wrap;
    }

    :host([variant='vertical']) .wrapper,
    :host([variant='settings-group']) .wrapper {
      display: block;
    }

    :host([variant='horizontal']) ::slotted(vscode-checkbox-group),
    :host([variant='horizontal']) ::slotted(vscode-radio-group) {
      width: calc(100% - calc(var(--label-width) + var(--label-right-margin)));
    }

    :host([variant='horizontal']) ::slotted(vscode-label) {
      margin-right: var(--label-right-margin);
      text-align: right;
      width: var(--label-width);
    }

    :host([variant='settings-group']) ::slotted(vscode-label) {
      height: 18px;
      line-height: 18px;
      margin-bottom: 4px;
      margin-right: 0;
      padding: 0;
    }

    ::slotted(vscode-form-helper) {
      margin-left: calc(var(--label-width) + var(--label-right-margin));
    }

    :host([variant='vertical']) ::slotted(vscode-form-helper),
    :host([variant='settings-group']) ::slotted(vscode-form-helper) {
      display: block;
      margin-left: 0;
    }

    :host([variant='settings-group']) ::slotted(vscode-form-helper) {
      margin-bottom: 0;
      margin-top: 0;
    }

    :host([variant='vertical']) ::slotted(vscode-label),
    :host([variant='settings-group']) ::slotted(vscode-label) {
      display: block;
      margin-left: 0;
      text-align: left;
    }

    :host([variant='settings-group']) ::slotted(vscode-inputbox),
    :host([variant='settings-group']) ::slotted(vscode-textfield),
    :host([variant='settings-group']) ::slotted(vscode-textarea),
    :host([variant='settings-group']) ::slotted(vscode-single-select),
    :host([variant='settings-group']) ::slotted(vscode-multi-select) {
      margin-top: 9px;
    }

    ::slotted(vscode-button:first-child) {
      margin-left: calc(var(--label-width) + var(--label-right-margin));
    }

    :host([variant='vertical']) ::slotted(vscode-button) {
      margin-left: 0;
    }

    ::slotted(vscode-button) {
      margin-right: 4px;
    }
  `];var be=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let fe=class extends gt{constructor(){super(...arguments),this.variant="horizontal"}render(){return L`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};fe.styles=ve,be([ct({reflect:!0})],fe.prototype,"variant",void 0),fe=be([mt("vscode-form-group")],fe);const ge=[xt,n`
    :host {
      display: block;
      line-height: 1.4em;
      margin-bottom: 4px;
      margin-top: 4px;
      max-width: 720px;
      opacity: 0.9;
    }

    :host([vertical]) {
      margin-left: 0;
    }
  `];var me=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};const xe=new CSSStyleSheet;xe.replaceSync("\n  vscode-form-helper * {\n    margin: 0;\n  }\n\n  vscode-form-helper *:not(:last-child) {\n    margin-bottom: 8px;\n  }\n");let ye=class extends gt{constructor(){super(),this._injectLightDOMStyles()}_injectLightDOMStyles(){const t=document.adoptedStyleSheets.find((t=>t===xe));t||document.adoptedStyleSheets.push(xe)}render(){return L`<slot></slot>`}};ye.styles=ge,ye=me([mt("vscode-form-helper")],ye);let we=0;const ke=(t="")=>(we++,`${t}${we}`),$e=[xt,n`
    :host {
      display: block;
    }

    .wrapper {
      display: flex;
      flex-wrap: wrap;
    }

    :host([variant='vertical']) .wrapper {
      display: block;
    }

    ::slotted(vscode-radio) {
      margin-right: 20px;
    }

    ::slotted(vscode-radio:last-child) {
      margin-right: 0;
    }

    :host([variant='vertical']) ::slotted(vscode-radio) {
      display: block;
      margin-bottom: 15px;
    }

    :host([variant='vertical']) ::slotted(vscode-radio:last-child) {
      margin-bottom: 0;
    }
  `];var _e=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Ce=class extends gt{constructor(){super(...arguments),this.variant="horizontal",this.role="radiogroup",this._focusedRadio=-1,this._checkedRadio=-1,this._firstContentLoaded=!1,this._onKeyDownBound=this._onKeyDown.bind(this)}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._onKeyDownBound)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._onKeyDownBound)}_uncheckPreviousChecked(t,e){-1!==t&&(this._radios[t].checked=!1),-1!==e&&(this._radios[e].tabIndex=-1)}_afterCheck(){this._focusedRadio=this._checkedRadio,this._radios[this._checkedRadio].checked=!0,this._radios[this._checkedRadio].tabIndex=0,this._radios[this._checkedRadio].focus()}_checkPrev(){const t=this._radios.findIndex((t=>t.checked)),e=this._radios.findIndex((t=>t.focused)),s=-1!==e?e:t;this._uncheckPreviousChecked(t,e),this._checkedRadio=-1===s?this._radios.length-1:s-1>=0?s-1:this._radios.length-1,this._afterCheck()}_checkNext(){const t=this._radios.findIndex((t=>t.checked)),e=this._radios.findIndex((t=>t.focused)),s=-1!==e?e:t;this._uncheckPreviousChecked(t,e),-1===s?this._checkedRadio=0:s+1<this._radios.length?this._checkedRadio=s+1:this._checkedRadio=0,this._afterCheck()}_onKeyDown(t){const{key:e}=t;["ArrowLeft","ArrowUp","ArrowRight","ArrowDown"].includes(e)&&t.preventDefault(),"ArrowRight"!==e&&"ArrowDown"!==e||this._checkNext(),"ArrowLeft"!==e&&"ArrowUp"!==e||this._checkPrev()}_onChange(t){const e=this._radios.findIndex((e=>e===t.target));-1!==e&&(-1!==this._focusedRadio&&(this._radios[this._focusedRadio].tabIndex=-1),-1!==this._checkedRadio&&this._checkedRadio!==e&&(this._radios[this._checkedRadio].checked=!1),this._focusedRadio=e,this._checkedRadio=e,this._radios[e].tabIndex=0)}_onSlotChange(){if(!this._firstContentLoaded){const t=this._radios.findIndex((t=>t.autofocus));t>-1&&(this._focusedRadio=t),this._firstContentLoaded=!0}this._radios.forEach(((t,e)=>{this._focusedRadio>-1?t.tabIndex=e===this._focusedRadio?0:-1:t.tabIndex=0===e?0:-1}))}render(){return L`
      <div class="wrapper">
        <slot
          @slotchange=${this._onSlotChange}
          @vsc-change=${this._onChange}
        ></slot>
      </div>
    `}};Ce.styles=$e,_e([ct({reflect:!0})],Ce.prototype,"variant",void 0),_e([ct({reflect:!0})],Ce.prototype,"role",void 0),_e([vt({selector:"vscode-radio"})],Ce.prototype,"_radios",void 0),_e([ht()],Ce.prototype,"_focusedRadio",void 0),_e([ht()],Ce.prototype,"_checkedRadio",void 0),Ce=_e([mt("vscode-radio-group")],Ce);const Be=[xt,n`
    :host {
      display: inline-block;
      height: 40px;
      position: relative;
      width: 320px;
    }

    :host([cols]) {
      width: auto;
    }

    :host([rows]) {
      height: auto;
    }

    .shadow {
      box-shadow: var(--vscode-scrollbar-shadow, #000000) 0 6px 6px -6px inset;
      display: none;
      inset: 0 0 auto 0;
      height: 6px;
      pointer-events: none;
      position: absolute;
      width: 100%;
    }

    .shadow.visible {
      display: block;
    }

    textarea {
      background-color: var(--vscode-settings-textInputBackground, #313131);
      border-color: var(--vscode-settings-textInputBorder, transparent);
      border-radius: 2px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-settings-textInputForeground, #cccccc);
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      height: 100%;
      width: 100%;
    }

    :host([cols]) textarea {
      width: auto;
    }

    :host([rows]) textarea {
      height: auto;
    }

    :host([invalid]) textarea,
    :host(:invalid) textarea {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    textarea.monospace {
      background-color: var(--vscode-editor-background, #1f1f1f);
      color: var(--vscode-editor-foreground, #cccccc);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 14px);
      font-weight: var(--vscode-editor-font-weight, normal);
    }

    .textarea.monospace::placeholder {
      color: var(
        --vscode-editor-inlineValuesForeground,
        rgba(255, 255, 255, 0.5)
      );
    }

    textarea.cursor-pointer {
      cursor: pointer;
    }

    textarea:focus {
      border-color: var(--vscode-focusBorder, #0078d4);
      outline: none;
    }

    textarea::placeholder {
      color: var(--vscode-input-placeholderForeground, #989898);
      opacity: 1;
    }

    textarea::-webkit-scrollbar-track {
      background-color: transparent;
    }

    textarea::-webkit-scrollbar {
      width: 14px;
    }

    textarea::-webkit-scrollbar-thumb {
      background-color: transparent;
    }

    textarea:hover::-webkit-scrollbar-thumb {
      background-color: var(
        --vscode-scrollbarSlider-background,
        rgba(121, 121, 121, 0.4)
      );
    }

    textarea::-webkit-scrollbar-thumb:hover {
      background-color: var(
        --vscode-scrollbarSlider-hoverBackground,
        rgba(100, 100, 100, 0.7)
      );
    }

    textarea::-webkit-scrollbar-thumb:active {
      background-color: var(
        --vscode-scrollbarSlider-activeBackground,
        rgba(191, 191, 191, 0.4)
      );
    }

    textarea::-webkit-scrollbar-corner {
      background-color: transparent;
    }

    textarea::-webkit-resizer {
      background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAHCAYAAADEUlfTAAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAACJJREFUeJxjYMAOZuIQZ5j5//9/rJJESczEKYGsG6cEXgAAsEEefMxkua4AAAAASUVORK5CYII=');
      background-repeat: no-repeat;
      background-position: right bottom;
    }
  `];var Se=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let ze=class extends gt{set value(t){this._value=t,this._internals.setFormValue(t)}get value(){return this._value}get wrappedElement(){return this._textareaEl}get form(){return this._internals.form}get type(){return"textarea"}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}set minlength(t){this.minLength=t}get minlength(){return this.minLength}set maxlength(t){this.maxLength=t}get maxlength(){return this.maxLength}constructor(){super(),this.autocomplete=void 0,this.autofocus=!1,this.defaultValue="",this.disabled=!1,this.invalid=!1,this.label="",this.maxLength=void 0,this.minLength=void 0,this.rows=void 0,this.cols=void 0,this.name=void 0,this.placeholder=void 0,this.readonly=!1,this.resize="none",this.required=!1,this.spellcheck=!1,this.monospace=!1,this._value="",this._textareaPointerCursor=!1,this._shadow=!1,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then((()=>{this._textareaEl.checkValidity(),this._setValidityFromInput(),this._internals.setFormValue(this._textareaEl.value)}))}updated(t){const e=["maxLength","minLength","required"];for(const s of t.keys())if(e.includes(String(s))){this.updateComplete.then((()=>{this._setValidityFromInput()}));break}}formResetCallback(){this.value=this.defaultValue}formStateRestoreCallback(t,e){this.updateComplete.then((()=>{this._value=t}))}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}_setValidityFromInput(){this._internals.setValidity(this._textareaEl.validity,this._textareaEl.validationMessage,this._textareaEl)}_dataChanged(){this._value=this._textareaEl.value,this._internals.setFormValue(this._textareaEl.value)}_handleChange(t){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new Event("change")),this.dispatchEvent(new CustomEvent("vsc-change",{detail:{data:this.value,originalEvent:t}}))}_handleInput(t){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new CustomEvent("vsc-input",{detail:{data:t.data,originalEvent:t}}))}_handleMouseMove(t){if(this._textareaEl.clientHeight>=this._textareaEl.scrollHeight)return void(this._textareaPointerCursor=!1);const e=this._textareaEl.getBoundingClientRect(),s=t.clientX;this._textareaPointerCursor=s>=e.left+e.width-14-2}_handleScroll(){this._shadow=this._textareaEl.scrollTop>0}render(){return L`
      <div
        class=${At({shadow:!0,visible:this._shadow})}
      ></div>
      <textarea
        autocomplete=${Et(this.autocomplete)}
        ?autofocus=${this.autofocus}
        ?disabled=${this.disabled}
        aria-label=${this.label}
        id="textarea"
        class=${At({monospace:this.monospace,"cursor-pointer":this._textareaPointerCursor})}
        maxlength=${Et(this.maxLength)}
        minlength=${Et(this.minLength)}
        rows=${Et(this.rows)}
        cols=${Et(this.cols)}
        name=${Et(this.name)}
        placeholder=${Et(this.placeholder)}
        ?readonly=${this.readonly}
        .style=${Ot({resize:this.resize})}
        ?required=${this.required}
        spellcheck=${this.spellcheck}
        @change=${this._handleChange}
        @input=${this._handleInput}
        @mousemove=${this._handleMouseMove}
        @scroll=${this._handleScroll}
        .value=${this._value}
      ></textarea>
    `}};ze.styles=Be,ze.formAssociated=!0,ze.shadowRootOptions={...rt.shadowRootOptions,delegatesFocus:!0},Se([ct()],ze.prototype,"autocomplete",void 0),Se([ct({type:Boolean,reflect:!0})],ze.prototype,"autofocus",void 0),Se([ct({attribute:"default-value"})],ze.prototype,"defaultValue",void 0),Se([ct({type:Boolean,reflect:!0})],ze.prototype,"disabled",void 0),Se([ct({type:Boolean,reflect:!0})],ze.prototype,"invalid",void 0),Se([ct({attribute:!1})],ze.prototype,"label",void 0),Se([ct({type:Number})],ze.prototype,"maxLength",void 0),Se([ct({type:Number})],ze.prototype,"minLength",void 0),Se([ct({type:Number})],ze.prototype,"rows",void 0),Se([ct({type:Number})],ze.prototype,"cols",void 0),Se([ct()],ze.prototype,"name",void 0),Se([ct()],ze.prototype,"placeholder",void 0),Se([ct({type:Boolean,reflect:!0})],ze.prototype,"readonly",void 0),Se([ct()],ze.prototype,"resize",void 0),Se([ct({type:Boolean,reflect:!0})],ze.prototype,"required",void 0),Se([ct({type:Boolean})],ze.prototype,"spellcheck",void 0),Se([ct({type:Boolean,reflect:!0})],ze.prototype,"monospace",void 0),Se([ct()],ze.prototype,"value",null),Se([ut("#textarea")],ze.prototype,"_textareaEl",void 0),Se([ht()],ze.prototype,"_value",void 0),Se([ht()],ze.prototype,"_textareaPointerCursor",void 0),Se([ht()],ze.prototype,"_shadow",void 0),ze=Se([mt("vscode-textarea")],ze);const Ae=r(yt()),Ee=[xt,n`
    :host {
      align-items: center;
      background-color: var(--vscode-settings-textInputBackground, #313131);
      border-color: var(
        --vscode-settings-textInputBorder,
        var(--vscode-settings-textInputBackground, #3c3c3c)
      );
      border-radius: 2px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-settings-textInputForeground, #cccccc);
      display: inline-flex;
      max-width: 100%;
      position: relative;
      width: 320px;
    }

    :host([focused]) {
      border-color: var(--vscode-focusBorder, #0078d4);
    }

    :host([invalid]),
    :host(:invalid) {
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    :host([invalid]) input,
    :host(:invalid) input {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    }

    ::slotted([slot='content-before']) {
      display: block;
      margin-left: 2px;
    }

    ::slotted([slot='content-after']) {
      display: block;
      margin-right: 2px;
    }

    slot[name='content-before'],
    slot[name='content-after'] {
      align-items: center;
      display: flex;
    }

    input {
      background-color: var(--vscode-settings-textInputBackground, #313131);
      border: 0;
      box-sizing: border-box;
      color: var(--vscode-settings-textInputForeground, #cccccc);
      display: block;
      font-family: var(--vscode-font-family, ${Ae});
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, 'normal');
      line-height: 18px;
      outline: none;
      padding-bottom: 3px;
      padding-left: 4px;
      padding-right: 4px;
      padding-top: 3px;
      width: 100%;
    }

    input:read-only:not([type='file']) {
      cursor: not-allowed;
    }

    input::placeholder {
      color: var(--vscode-input-placeholderForeground, #989898);
      opacity: 1;
    }

    input[type='file'] {
      line-height: 24px;
      padding-bottom: 0;
      padding-left: 2px;
      padding-top: 0;
    }

    input[type='file']::file-selector-button {
      background-color: var(--vscode-button-background, #0078d4);
      border: 0;
      border-radius: 2px;
      color: var(--vscode-button-foreground, #ffffff);
      cursor: pointer;
      font-family: var(--vscode-font-family, ${Ae});
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, 'normal');
      line-height: 20px;
      padding: 0 14px;
    }

    input[type='file']::file-selector-button:hover {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
    }
  `];var Oe=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let je=class extends gt{set type(t){this._type=["color","date","datetime-local","email","file","month","number","password","search","tel","text","time","url","week"].includes(t)?t:"text"}get type(){return this._type}set value(t){"file"!==this.type&&(this._value=t,this._internals.setFormValue(t)),this.updateComplete.then((()=>{this._setValidityFromInput()}))}get value(){return this._value}set minlength(t){this.minLength=t}get minlength(){return this.minLength}set maxlength(t){this.maxLength=t}get maxlength(){return this.maxLength}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._setValidityFromInput(),this._internals.checkValidity()}reportValidity(){return this._setValidityFromInput(),this._internals.reportValidity()}get wrappedElement(){return this._inputEl}constructor(){super(),this.autocomplete=void 0,this.autofocus=!1,this.defaultValue="",this.disabled=!1,this.focused=!1,this.invalid=!1,this.label="",this.max=void 0,this.maxLength=void 0,this.min=void 0,this.minLength=void 0,this.multiple=!1,this.name=void 0,this.pattern=void 0,this.placeholder=void 0,this.readonly=!1,this.required=!1,this.step=void 0,this._value="",this._type="text",this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then((()=>{this._inputEl.checkValidity(),this._setValidityFromInput(),this._internals.setFormValue(this._inputEl.value)}))}attributeChangedCallback(t,e,s){super.attributeChangedCallback(t,e,s);["max","maxlength","min","minlength","pattern","required","step"].includes(t)&&this.updateComplete.then((()=>{this._setValidityFromInput()}))}formResetCallback(){this.value=this.defaultValue,this.requestUpdate()}formStateRestoreCallback(t,e){this.value=t}_dataChanged(){if(this._value=this._inputEl.value,"file"===this.type&&this._inputEl.files)for(const t of this._inputEl.files)this._internals.setFormValue(t);else this._internals.setFormValue(this._inputEl.value)}_setValidityFromInput(){this._inputEl&&this._internals.setValidity(this._inputEl.validity,this._inputEl.validationMessage,this._inputEl)}_onInput(t){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new CustomEvent("vsc-input",{detail:{data:t.data,originalEvent:t}}))}_onChange(t){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new Event("change")),this.dispatchEvent(new CustomEvent("vsc-change",{detail:{data:this.value,originalEvent:t}}))}_onFocus(){this.focused=!0}_onBlur(){this.focused=!1}_onKeyDown(t){"Enter"===t.key&&this._internals.form&&this._internals.form?.requestSubmit()}render(){return L`
      <slot name="content-before"></slot>
      <input
        id="input"
        type=${this.type}
        ?autofocus=${this.autofocus}
        autocomplete=${Et(this.autocomplete)}
        aria-label=${this.label}
        ?disabled=${this.disabled}
        max=${Et(this.max)}
        maxlength=${Et(this.maxLength)}
        min=${Et(this.min)}
        minlength=${Et(this.minLength)}
        ?multiple=${this.multiple}
        name=${Et(this.name)}
        pattern=${Et(this.pattern)}
        placeholder=${Et(this.placeholder)}
        ?readonly=${this.readonly}
        ?required=${this.required}
        step=${Et(this.step)}
        .value=${this._value}
        @blur=${this._onBlur}
        @change=${this._onChange}
        @focus=${this._onFocus}
        @input=${this._onInput}
        @keydown=${this._onKeyDown}
      >
      <slot name="content-after"></slot>
    `}};je.styles=Ee,je.formAssociated=!0,je.shadowRootOptions={...rt.shadowRootOptions,delegatesFocus:!0},Oe([ct()],je.prototype,"autocomplete",void 0),Oe([ct({type:Boolean,reflect:!0})],je.prototype,"autofocus",void 0),Oe([ct({attribute:"default-value"})],je.prototype,"defaultValue",void 0),Oe([ct({type:Boolean,reflect:!0})],je.prototype,"disabled",void 0),Oe([ct({type:Boolean,reflect:!0})],je.prototype,"focused",void 0),Oe([ct({type:Boolean,reflect:!0})],je.prototype,"invalid",void 0),Oe([ct({attribute:!1})],je.prototype,"label",void 0),Oe([ct({type:Number})],je.prototype,"max",void 0),Oe([ct({type:Number})],je.prototype,"maxLength",void 0),Oe([ct({type:Number})],je.prototype,"min",void 0),Oe([ct({type:Number})],je.prototype,"minLength",void 0),Oe([ct({type:Boolean,reflect:!0})],je.prototype,"multiple",void 0),Oe([ct({reflect:!0})],je.prototype,"name",void 0),Oe([ct()],je.prototype,"pattern",void 0),Oe([ct()],je.prototype,"placeholder",void 0),Oe([ct({type:Boolean,reflect:!0})],je.prototype,"readonly",void 0),Oe([ct({type:Boolean,reflect:!0})],je.prototype,"required",void 0),Oe([ct({type:Number})],je.prototype,"step",void 0),Oe([ct({reflect:!0})],je.prototype,"type",null),Oe([ct()],je.prototype,"value",null),Oe([ut("#input")],je.prototype,"_inputEl",void 0),Oe([ht()],je.prototype,"_value",void 0),Oe([ht()],je.prototype,"_type",void 0),je=Oe([mt("vscode-textfield")],je);const Ie=[xt,n`
    :host {
      color: var(--vscode-foreground, #cccccc);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: 600;
      line-height: ${1.2307692307692308};
      cursor: default;
      display: block;
      padding: 5px 0;
    }

    .wrapper {
      display: block;
    }

    .wrapper.required:after {
      content: ' *';
    }

    ::slotted(.normal) {
      font-weight: normal;
    }

    ::slotted(.lightened) {
      color: var(--vscode-foreground, #cccccc);
      opacity: 0.9;
    }
  `];var Me=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Fe=class extends gt{constructor(){super(...arguments),this.required=!1,this._id="",this._htmlFor="",this._connected=!1}set htmlFor(t){this._htmlFor=t,this.setAttribute("for",t),this._connected&&this._connectWithTarget()}get htmlFor(){return this._htmlFor}set id(t){this._id=t}get id(){return this._id}attributeChangedCallback(t,e,s){super.attributeChangedCallback(t,e,s)}connectedCallback(){super.connectedCallback(),this._connected=!0,""===this._id&&(this._id=ke("vscode-label-"),this.setAttribute("id",this._id)),this._connectWithTarget()}_getTarget(){let t=null;if(this._htmlFor){const e=this.getRootNode({composed:!1});e&&(t=e.querySelector(`#${this._htmlFor}`))}return t}async _connectWithTarget(){await this.updateComplete;const t=this._getTarget();(t instanceof Ce||t instanceof Jt)&&t.setAttribute("aria-labelledby",this._id);let e="";this.textContent&&(e=this.textContent.trim()),(t instanceof je||t instanceof ze)&&(t.label=e)}_handleClick(){const t=this._getTarget();t&&"focus"in t&&t.focus()}render(){return L`
      <label
        class=${At({wrapper:!0,required:this.required})}
        @click=${this._handleClick}
        ><slot></slot
      ></label>
    `}};Fe.styles=Ie,Me([ct({reflect:!0,attribute:"for"})],Fe.prototype,"htmlFor",null),Me([ct()],Fe.prototype,"id",null),Me([ct({type:Boolean,reflect:!0})],Fe.prototype,"required",void 0),Fe=Me([mt("vscode-label")],Fe);const{I:Pe}=it,De=()=>document.createComment(""),Ne=(t,e,s)=>{const i=t._$AA.parentNode,o=void 0===e?t._$AB:e._$AA;if(void 0===s){const e=i.insertBefore(De(),o),r=i.insertBefore(De(),o);s=new Pe(e,r,t,t.options)}else{const e=s._$AB.nextSibling,r=s._$AM,n=r!==t;if(n){let e;s._$AQ?.(t),s._$AM=t,void 0!==s._$AP&&(e=t._$AU)!==r._$AU&&s._$AP(e)}if(e!==o||n){let t=s._$AA;for(;t!==e;){const e=t.nextSibling;i.insertBefore(t,o),t=e}}}return s},Ve=(t,e,s=t)=>(t._$AI(e,s),t),Te={},Re=t=>{t._$AP?.(!1,!0);let e=t._$AA;const s=t._$AB.nextSibling;for(;e!==s;){const t=e.nextSibling;e.remove(),e=t}},Le=(t,e,s)=>{const i=new Map;for(let o=e;o<=s;o++)i.set(t[o],o);return i},Ue=St(class extends zt{constructor(t){if(super(t),t.type!==Ct)throw Error("repeat() can only be used in text expressions")}dt(t,e,s){let i;void 0===s?s=e:void 0!==e&&(i=e);const o=[],r=[];let n=0;for(const e of t)o[n]=i?i(e,n):n,r[n]=s(e,n),n++;return{values:r,keys:o}}render(t,e,s){return this.dt(t,e,s).values}update(t,[e,s,i]){const o=(t=>t._$AH)(t),{values:r,keys:n}=this.dt(e,s,i);if(!Array.isArray(o))return this.ut=n,r;const a=this.ut??=[],l=[];let c,h,d=0,u=o.length-1,p=0,v=r.length-1;for(;d<=u&&p<=v;)if(null===o[d])d++;else if(null===o[u])u--;else if(a[d]===n[p])l[p]=Ve(o[d],r[p]),d++,p++;else if(a[u]===n[v])l[v]=Ve(o[u],r[v]),u--,v--;else if(a[d]===n[v])l[v]=Ve(o[d],r[v]),Ne(t,l[v+1],o[d]),d++,v--;else if(a[u]===n[p])l[p]=Ve(o[u],r[p]),Ne(t,o[d],o[u]),u--,p++;else if(void 0===c&&(c=Le(n,p,v),h=Le(a,d,u)),c.has(a[d]))if(c.has(a[u])){const e=h.get(n[p]),s=void 0!==e?o[e]:null;if(null===s){const e=Ne(t,o[d]);Ve(e,r[p]),l[p]=e}else l[p]=Ve(s,r[p]),Ne(t,o[d],s),o[e]=null;p++}else Re(o[u]),u--;else Re(o[d]),d++;for(;p<=v;){const e=Ne(t,l[v+1]);Ve(e,r[p]),l[p++]=e}for(;d<=u;){const t=o[d++];null!==t&&Re(t)}return this.ut=n,((t,e=Te)=>{t._$AH=e})(t,l),U}}),qe=L`
  <span class="icon">
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"
      />
    </svg>
  </span>
`;var He=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Ke=class extends gt{constructor(){super(...arguments),this.description="",this.selected=!1,this.disabled=!1,this._initialized=!1,this._handleSlotChange=()=>{this._initialized&&this.dispatchEvent(new Event("vsc-option-state-change",{bubbles:!0}))}}connectedCallback(){super.connectedCallback(),this.updateComplete.then((()=>{this._initialized=!0}))}willUpdate(t){this._initialized&&(t.has("description")||t.has("value")||t.has("selected")||t.has("disabled"))&&this.dispatchEvent(new Event("vsc-option-state-change",{bubbles:!0}))}render(){return L`<slot @slotchange=${this._handleSlotChange}></slot>`}};Ke.styles=xt,He([ct({type:String})],Ke.prototype,"value",void 0),He([ct({type:String})],Ke.prototype,"description",void 0),He([ct({type:Boolean,reflect:!0})],Ke.prototype,"selected",void 0),He([ct({type:Boolean,reflect:!0})],Ke.prototype,"disabled",void 0),Ke=He([mt("vscode-option")],Ke);const We=(t,e,s)=>{const i=[];return t.forEach((t=>{let o;switch(s){case"startsWithPerTerm":o=((t,e)=>{const s={match:!1,ranges:[]},i=t.toLowerCase(),o=e.toLowerCase(),r=i.split(" ");let n=0;return r.forEach(((e,i)=>{if(i>0&&(n+=r[i-1].length+1),s.match)return;const a=e.indexOf(o),l=o.length;0===a&&(s.match=!0,s.ranges.push([n+a,Math.min(n+a+l,t.length)]))})),s})(t.label,e);break;case"startsWith":o=((t,e)=>{const s={match:!1,ranges:[]};return 0===t.toLowerCase().indexOf(e.toLowerCase())&&(s.match=!0,s.ranges=[[0,e.length]]),s})(t.label,e);break;case"contains":o=((t,e)=>{const s={match:!1,ranges:[]},i=t.toLowerCase().indexOf(e.toLowerCase());return i>-1&&(s.match=!0,s.ranges=[[i,i+e.length]]),s})(t.label,e);break;default:o=((t,e)=>{const s={match:!1,ranges:[]};let i=0,o=0;const r=e.length-1,n=t.toLowerCase(),a=e.toLowerCase();for(let t=0;t<=r;t++){if(o=n.indexOf(a[t],i),-1===o)return{match:!1,ranges:[]};s.match=!0,s.ranges.push([o,o+1]),i=o+1}return s})(t.label,e)}o.match&&i.push({...t,ranges:o.ranges})})),i},Ge=t=>{const e=[];return" "===t?(e.push(L`&nbsp;`),e):(0===t.indexOf(" ")&&e.push(L`&nbsp;`),e.push(L`${t.trimStart().trimEnd()}`),t.lastIndexOf(" ")===t.length-1&&e.push(L`&nbsp;`),e)},Je=(t,e)=>{const s=[],i=e.length;return i<1?L`${t}`:(e.forEach(((o,r)=>{const n=t.substring(o[0],o[1]);0===r&&0!==o[0]&&s.push(...Ge(t.substring(0,e[0][0]))),r>0&&r<i&&o[0]-e[r-1][1]!=0&&s.push(...Ge(t.substring(e[r-1][1],o[0]))),s.push(L`<b>${Ge(n)}</b>`),r===i-1&&o[1]<t.length&&s.push(...Ge(t.substring(o[1],t.length)))})),s)};var Ye=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};const Xe=22;class Ze extends gt{set disabled(t){this._disabled=t,this.ariaDisabled=t?"true":"false",!0===t?(this._originalTabIndex=this.tabIndex,this.tabIndex=-1):(this.tabIndex=this._originalTabIndex??0,this._originalTabIndex=void 0),this.requestUpdate()}get disabled(){return this._disabled}set filter(t){["contains","fuzzy","startsWith","startsWithPerTerm"].includes(t)?this._filter=t:(this._filter="fuzzy",console.warn(`[VSCode Webview Elements] Invalid filter: "${t}", fallback to default. Valid values are: "contains", "fuzzy", "startsWith", "startsWithPerm".`,this))}get filter(){return this._filter}set options(t){this._options=t.map(((t,e)=>({...t,index:e})))}get options(){return this._options.map((({label:t,value:e,description:s,selected:i,disabled:o})=>({label:t,value:e,description:s,selected:i,disabled:o})))}constructor(){super(),this.ariaExpanded="false",this.combobox=!1,this.invalid=!1,this.focused=!1,this.open=!1,this.position="below",this.tabIndex=0,this._activeIndex=-1,this._currentDescription="",this._filter="fuzzy",this._filterPattern="",this._selectedIndex=-1,this._selectedIndexes=[],this._options=[],this._value="",this._values=[],this._listScrollTop=0,this._multiple=!1,this._valueOptionIndexMap={},this._isHoverForbidden=!1,this._disabled=!1,this._originalTabIndex=void 0,this._onClickOutside=t=>{const e=t.composedPath().findIndex((t=>t===this));-1===e&&(this._toggleDropdown(!1),window.removeEventListener("click",this._onClickOutside))},this._onMouseMove=()=>{this._isHoverForbidden=!1,window.removeEventListener("mousemove",this._onMouseMove)},this.addEventListener("vsc-option-state-change",(t=>{t.stopPropagation(),this._setStateFromSlottedElements(),this.requestUpdate()}))}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._onComponentKeyDown),this.addEventListener("focus",this._onComponentFocus),this.addEventListener("blur",this._onComponentBlur)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._onComponentKeyDown),this.removeEventListener("focus",this._onComponentFocus),this.removeEventListener("blur",this._onComponentBlur)}get _filteredOptions(){return this.combobox&&""!==this._filterPattern?We(this._options,this._filterPattern,this._filter):this._options}get _currentOptions(){return this.combobox?this._filteredOptions:this._options}_setStateFromSlottedElements(){const t=[];let e=0;const s=this._assignedOptions??[],i=[],o=[];this._valueOptionIndexMap={},s.forEach(((s,r)=>{const{innerText:n,description:a,disabled:l}=s,c="string"==typeof s.value?s.value:n.trim(),h=s.selected??!1,d={label:n.trim(),value:c,description:a,selected:h,index:e,disabled:l};e=t.push(d),h&&!this._multiple&&(this._activeIndex=r),h&&(i.push(t.length-1),o.push(c)),this._valueOptionIndexMap[d.value]=d.index})),this._options=t,i.length>0&&(this._selectedIndex=i[0],this._selectedIndexes=i,this._value=o[0],this._values=o),this._multiple||this.combobox||0!==i.length||(this._selectedIndex=this._options.length>0?0:-1)}async _toggleDropdown(t){this.open=t,this.ariaExpanded=String(t),!t||this._multiple||this.combobox||(this._activeIndex=this._selectedIndex,this._activeIndex>9&&(await this.updateComplete,this._listElement.scrollTop=Math.floor(this._activeIndex*Xe))),t?window.addEventListener("click",this._onClickOutside):window.removeEventListener("click",this._onClickOutside)}_dispatchChangeEvent(){this._multiple?this.dispatchEvent(new CustomEvent("vsc-change",{detail:{selectedIndexes:this._selectedIndexes,value:this._values}})):this.dispatchEvent(new CustomEvent("vsc-change",{detail:{selectedIndex:this._selectedIndex,value:this._value}})),this.dispatchEvent(new Event("change")),this.dispatchEvent(new Event("input"))}_onFaceClick(){this._toggleDropdown(!this.open),this._multiple&&(this._activeIndex=0)}_toggleComboboxDropdown(){this._filterPattern="",this._toggleDropdown(!this.open),this._multiple&&(this._activeIndex=-1)}_onComboboxButtonClick(){this._toggleComboboxDropdown()}_onComboboxButtonKeyDown(t){"Enter"===t.key&&this._toggleComboboxDropdown()}_onOptionMouseOver(t){if(this._isHoverForbidden)return;const e=t.target;e.matches(".option")&&(this._activeIndex=Number(this.combobox?e.dataset.filteredIndex:e.dataset.index))}_onEnterKeyDown(){const t=this.combobox?this._filteredOptions:this._options,e=!this.open;this._toggleDropdown(e),this._multiple||e||this._selectedIndex===this._activeIndex||(this._selectedIndex=this._activeIndex>-1?t[this._activeIndex].index:-1,this._value=this._selectedIndex>-1?this._options[this._selectedIndex].value:"",this._dispatchChangeEvent()),this.combobox&&(this._multiple||e||(this._selectedIndex=this._activeIndex>-1?this._filteredOptions[this._activeIndex].index:-1),!this._multiple&&e&&this.updateComplete.then((()=>{this._scrollActiveElementToTop()}))),this._multiple&&e&&(this._activeIndex=0)}_onSpaceKeyDown(){if(this.open){if(this.open&&this._multiple&&this._activeIndex>-1){const t=this.combobox?this._filteredOptions:this._options,{selected:e}=t[this._activeIndex];t[this._activeIndex].selected=!e,this._selectedIndexes=[],t.forEach((({index:t,selected:e})=>{e&&this._selectedIndexes.push(t)}))}}else this._toggleDropdown(!0)}_scrollActiveElementToTop(){this._listElement.scrollTop=Math.floor(this._activeIndex*Xe)}async _adjustOptionListScrollPos(t){if((this.combobox?this._filteredOptions.length:this._options.length)<=10)return;this._isHoverForbidden=!0,window.addEventListener("mousemove",this._onMouseMove),this._listElement||await this.updateComplete;const e=this._listElement.scrollTop,s=this._activeIndex*Xe;"down"===t&&s+Xe>=34+e&&(this._listElement.scrollTop=(this._activeIndex-9)*Xe),"up"===t&&s<=e-Xe&&this._scrollActiveElementToTop()}_onArrowUpKeyDown(){if(this.open){if(this._activeIndex<=0)return;this._activeIndex-=1,this._adjustOptionListScrollPos("up")}}_onArrowDownKeyDown(){if(this.open){if(this._activeIndex>=this._currentOptions.length-1)return;this._activeIndex+=1,this._adjustOptionListScrollPos("down")}}_onComponentKeyDown(t){[" ","ArrowUp","ArrowDown","Escape"].includes(t.key)&&(t.stopPropagation(),t.preventDefault()),"Enter"===t.key&&this._onEnterKeyDown()," "===t.key&&this._onSpaceKeyDown(),"Escape"===t.key&&this._toggleDropdown(!1),"ArrowUp"===t.key&&this._onArrowUpKeyDown(),"ArrowDown"===t.key&&this._onArrowDownKeyDown()}_onComponentFocus(){this.focused=!0}_onComponentBlur(){this.focused=!1}_onSlotChange(){this._setStateFromSlottedElements(),this.requestUpdate()}_onComboboxInputFocus(t){t.target.select()}_onComboboxInputInput(t){this._filterPattern=t.target.value,this._activeIndex=-1,this._toggleDropdown(!0)}_onComboboxInputClick(){this._toggleDropdown(!0)}_renderOptions(){return[]}_renderDescription(){if(!this._options[this._activeIndex])return q;const{description:t}=this._options[this._activeIndex];return t?L`<div class="description">${t}</div>`:q}_renderSelectFace(){return L`${q}`}_renderComboboxFace(){return L`${q}`}_renderDropdownControls(){return L`${q}`}_renderDropdown(){const t=At({dropdown:!0,multiple:this._multiple});return L`
      <div class=${t}>
        ${"above"===this.position?this._renderDescription():q}
        ${this._renderOptions()} ${this._renderDropdownControls()}
        ${"below"===this.position?this._renderDescription():q}
      </div>
    `}render(){return L`
      <slot class="main-slot" @slotchange=${this._onSlotChange}></slot>
      ${this.combobox?this._renderComboboxFace():this._renderSelectFace()}
      ${this.open?this._renderDropdown():q}
    `}}Ye([ct({type:String,reflect:!0,attribute:"aria-expanded"})],Ze.prototype,"ariaExpanded",void 0),Ye([ct({type:Boolean,reflect:!0})],Ze.prototype,"combobox",void 0),Ye([ct({type:Boolean,reflect:!0})],Ze.prototype,"disabled",null),Ye([ct({type:Boolean,reflect:!0})],Ze.prototype,"invalid",void 0),Ye([ct()],Ze.prototype,"filter",null),Ye([ct({type:Boolean,reflect:!0})],Ze.prototype,"focused",void 0),Ye([ct({type:Boolean,reflect:!0})],Ze.prototype,"open",void 0),Ye([ct({type:Array})],Ze.prototype,"options",null),Ye([ct({reflect:!0})],Ze.prototype,"position",void 0),Ye([ct({type:Number,attribute:!0,reflect:!0})],Ze.prototype,"tabIndex",void 0),Ye([vt({flatten:!0,selector:"vscode-option"})],Ze.prototype,"_assignedOptions",void 0),Ye([ht()],Ze.prototype,"_activeIndex",void 0),Ye([ht()],Ze.prototype,"_currentDescription",void 0),Ye([ht()],Ze.prototype,"_filter",void 0),Ye([ht()],Ze.prototype,"_filteredOptions",null),Ye([ht()],Ze.prototype,"_filterPattern",void 0),Ye([ht()],Ze.prototype,"_selectedIndex",void 0),Ye([ht()],Ze.prototype,"_selectedIndexes",void 0),Ye([ht()],Ze.prototype,"_options",void 0),Ye([ht()],Ze.prototype,"_value",void 0),Ye([ht()],Ze.prototype,"_values",void 0),Ye([ht()],Ze.prototype,"_listScrollTop",void 0),Ye([ut(".options")],Ze.prototype,"_listElement",void 0);var Qe=[xt,n`
    :host {
      display: inline-block;
      max-width: 100%;
      outline: none;
      position: relative;
      width: 320px;
    }

    .main-slot {
      display: none;
    }

    .select-face,
    .combobox-face {
      background-color: var(--vscode-settings-dropdownBackground, #313131);
      border-color: var(--vscode-settings-dropdownBorder, #3c3c3c);
      border-radius: 2px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-settings-dropdownForeground, #cccccc);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 18px;
      position: relative;
      user-select: none;
      width: 100%;
    }

    :host([invalid]) .select-face,
    :host(:invalid) .select-face,
    :host([invalid]) .combobox-face,
    :host(:invalid) .combobox-face {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    .select-face {
      cursor: pointer;
      display: block;
      padding: 3px 4px;
    }

    .select-face .text {
      display: block;
      height: 18px;
      overflow: hidden;
    }

    .select-face.multiselect {
      padding: 0;
    }

    .select-face-badge {
      background-color: var(--vscode-badge-background, #616161);
      border-radius: 2px;
      color: var(--vscode-badge-foreground, #f8f8f8);
      display: inline-block;
      flex-shrink: 0;
      font-size: 11px;
      line-height: 16px;
      margin: 2px;
      padding: 2px 3px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .select-face-badge.no-item {
      background-color: transparent;
      color: inherit;
    }

    .combobox-face {
      display: flex;
    }

    :host(:focus) .select-face,
    :host(:focus) .combobox-face,
    :host([focused]) .select-face,
    :host([focused]) .combobox-face {
      border-color: var(--vscode-focusBorder, #0078d4);
      outline: none;
    }

    .combobox-input {
      background-color: transparent;
      box-sizing: border-box;
      border: 0;
      color: var(--vscode-foreground, #cccccc);
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      line-height: 16px;
      padding: 4px;
      width: 100%;
    }

    .combobox-input:focus {
      outline: none;
    }

    .combobox-button {
      background-color: transparent;
      border: 0;
      color: var(--vscode-foreground, #cccccc);
      cursor: pointer;
      flex-shrink: 0;
      height: 24px;
      margin: 0;
      padding: 0;
      width: 30px;
    }

    .combobox-button:focus,
    .combobox-button:hover {
      background-color: var(--vscode-list-hoverBackground, #2a2d2e);
    }

    .combobox-button:focus {
      outline: 0;
    }

    .icon {
      color: var(--vscode-foreground, #cccccc);
      display: block;
      height: 14px;
      pointer-events: none;
      position: absolute;
      right: 8px;
      top: 5px;
      width: 14px;
    }

    .icon svg {
      color: var(--vscode-foreground, #cccccc);
      height: 100%;
      width: 100%;
    }

    .dropdown {
      background-color: var(--vscode-settings-dropdownBackground, #313131);
      border-color: var(--vscode-settings-dropdownListBorder, #454545);
      border-radius: 0 0 3px 3px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      left: 0;
      padding-bottom: 2px;
      position: absolute;
      top: 100%;
      width: 100%;
      z-index: var(--dropdown-z-index, 2);
    }

    :host([position='above']) .dropdown {
      border-radius: 3px 3px 0 0;
      bottom: 26px;
      padding-bottom: 0;
      padding-top: 2px;
      top: auto;
    }

    :host(:focus) .dropdown,
    :host([focused]) .dropdown {
      border-color: var(--vscode-focusBorder, #0078d4);
    }

    .options {
      box-sizing: border-box;
      cursor: pointer;
      list-style: none;
      margin: 0;
      max-height: 222px;
      overflow: auto;
      padding: 1px;
    }

    .option {
      align-items: center;
      color: var(--vscode-foreground, #cccccc);
      cursor: pointer;
      display: flex;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 18px;
      min-height: calc(var(--vscode-font-size) * 1.3);
      padding: 1px 3px;
      user-select: none;
      border-width: 1px;
      border-style: solid;
      border-color: transparent;
    }

    .option b {
      color: var(--vscode-list-highlightForeground, #2aaaff);
    }

    .option.active b {
      color: var(--vscode-list-focusHighlightForeground, #2aaaff);
    }

    .option:not(.disabled):hover {
      background-color: var(--vscode-list-hoverBackground, #2a2d2e);
      color: var(--vscode-list-hoverForeground, #ffffff);
    }

    :host-context(body[data-vscode-theme-kind='vscode-high-contrast'])
      .option:hover,
    :host-context(body[data-vscode-theme-kind='vscode-high-contrast-light'])
      .option:hover {
      border-style: dotted;
      border-color: var(--vscode-list-focusOutline, #0078d4);
    }

    .option.disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }

    .option.active,
    .option.active:hover {
      background-color: var(--vscode-list-activeSelectionBackground, #04395e);
      color: var(--vscode-list-activeSelectionForeground, #ffffff);
      border-color: var(--vscode-list-activeSelectionBackground, #04395e);
      border-style: solid;
      border-width: 1px;
    }

    :host-context(body[data-vscode-theme-kind='vscode-high-contrast'])
      .option.active,
    :host-context(body[data-vscode-theme-kind='vscode-high-contrast-light'])
      .option.active:hover {
      border-color: var(--vscode-list-focusOutline, #0078d4);
      border-style: dashed;
    }

    .option-label {
      display: block;
      pointer-events: none;
      width: 100%;
    }

    .dropdown.multiple .option.selected {
      background-color: var(--vscode-list-hoverBackground, #2a2d2e);
      border-color: var(--vscode-list-hoverBackground, #2a2d2e);
    }

    .dropdown.multiple .option.selected.active {
      background-color: var(--vscode-list-activeSelectionBackground, #04395e);
      color: var(--vscode-list-activeSelectionForeground, #ffffff);
      border-color: var(--vscode-list-activeSelectionBackground, #04395e);
    }

    .checkbox-icon {
      background-color: var(--vscode-settings-checkboxBackground, #313131);
      border: 1px solid currentColor;
      border-radius: 2px;
      box-sizing: border-box;
      height: 14px;
      margin-right: 5px;
      overflow: hidden;
      position: relative;
      width: 14px;
    }

    .checkbox-icon.checked:before,
    .checkbox-icon.checked:after {
      content: '';
      display: block;
      height: 5px;
      position: absolute;
      transform: rotate(-45deg);
      width: 10px;
    }

    .checkbox-icon.checked:before {
      background-color: var(--vscode-foreground, #cccccc);
      left: 1px;
      top: 2.5px;
    }

    .checkbox-icon.checked:after {
      background-color: var(--vscode-settings-checkboxBackground, #313131);
      left: 1px;
      top: -0.5px;
    }

    .dropdown-controls {
      display: flex;
      justify-content: flex-end;
      padding: 4px;
    }

    .dropdown-controls :not(:last-child) {
      margin-right: 4px;
    }

    .action-icon {
      align-items: center;
      background-color: transparent;
      border: 0;
      color: var(--vscode-foreground, #cccccc);
      cursor: pointer;
      display: flex;
      height: 24px;
      justify-content: center;
      padding: 0;
      width: 24px;
    }

    .action-icon:focus {
      outline: none;
    }

    .action-icon:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: -1px;
    }

    .description {
      border-color: var(--vscode-settings-dropdownBorder, #3c3c3c);
      border-style: solid;
      border-width: 1px 0 0;
      color: var(--vscode-foreground, #cccccc);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 1.3;
      padding: 6px 4px;
      word-wrap: break-word;
    }

    :host([position='above']) .description {
      border-width: 0 0 1px;
    }
  `],ts=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let es=class extends Ze{set selectedIndexes(t){this._selectedIndexes=t}get selectedIndexes(){return this._selectedIndexes}set value(t){const e=Array.isArray(t)?t.map((t=>String(t))):[String(t)];this._values=[],this._selectedIndexes.forEach((t=>{this._options[t].selected=!1})),this._selectedIndexes=[],e.forEach((t=>{"number"==typeof this._valueOptionIndexMap[t]&&(this._selectedIndexes.push(this._valueOptionIndexMap[t]),this._options[this._valueOptionIndexMap[t]].selected=!0,this._values.push(t))})),this._selectedIndexes.length>0?this._requestedValueToSetLater=[]:this._requestedValueToSetLater=Array.isArray(t)?t:[t],this._setFormValue(),this._manageRequired()}get value(){return this._values}get form(){return this._internals.form}get type(){return"select-multiple"}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}constructor(){super(),this.defaultValue=[],this.required=!1,this.name=void 0,this._requestedValueToSetLater=[],this._multiple=!0,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then((()=>{this._setDefaultValue(),this._manageRequired()}))}formResetCallback(){this.updateComplete.then((()=>{this.value=this.defaultValue}))}formStateRestoreCallback(t,e){const s=Array.from(t.entries()).map((t=>String(t[1])));this.updateComplete.then((()=>{this.value=s}))}_setDefaultValue(){if(Array.isArray(this.defaultValue)&&this.defaultValue.length>0){const t=this.defaultValue.map((t=>String(t)));this.value=t}}_manageRequired(){const{value:t}=this;0===t.length&&this.required?this._internals.setValidity({valueMissing:!0},"Please select an item in the list.",this._faceElement):this._internals.setValidity({})}_setFormValue(){const t=new FormData;this._values.forEach((e=>{t.append(this.name??"",e)})),this._internals.setFormValue(t)}_onSlotChange(){super._onSlotChange(),this._requestedValueToSetLater.length>0&&this.options.forEach(((t,e)=>{this._requestedValueToSetLater.includes(t.value)&&(this._selectedIndexes.push(e),this._values.push(t.value),this._options[e].selected=!0,this._requestedValueToSetLater=this._requestedValueToSetLater.filter((e=>e!==t.value)))}))}_onOptionClick(t){const e=t.composedPath().find((t=>"matches"in t&&t.matches("li.option")));if(!e)return;const s=Number(e.dataset.index);if(this._options[s]){if(this._options[s].disabled)return;this._options[s].selected=!this._options[s].selected}this._selectedIndexes=[],this._values=[],this._options.forEach((t=>{t.selected&&(this._selectedIndexes.push(t.index),this._values.push(t.value))})),this._setFormValue(),this._manageRequired(),this._dispatchChangeEvent()}_onMultiAcceptClick(){this._toggleDropdown(!1)}_onMultiDeselectAllClick(){this._selectedIndexes=[],this._values=[],this._options=this._options.map((t=>({...t,selected:!1}))),this._manageRequired(),this._dispatchChangeEvent()}_onMultiSelectAllClick(){this._selectedIndexes=[],this._values=[],this._options=this._options.map((t=>({...t,selected:!0}))),this._options.forEach(((t,e)=>{this._selectedIndexes.push(e),this._values.push(t.value),this._dispatchChangeEvent()})),this._setFormValue(),this._manageRequired()}_renderLabel(){switch(this._selectedIndexes.length){case 0:return L`<span class="select-face-badge no-item"
          >No items selected</span
        >`;case 1:return L`<span class="select-face-badge">1 item selected</span>`;default:return L`<span class="select-face-badge"
          >${this._selectedIndexes.length} items selected</span
        >`}}_renderSelectFace(){return L`
      <div
        class="select-face face multiselect"
        @click=${this._onFaceClick}
        tabindex=${this.tabIndex>-1?0:-1}
      >
        ${this._renderLabel()} ${qe}
      </div>
    `}_renderComboboxFace(){const t=this._selectedIndex>-1?this._options[this._selectedIndex].label:"";return L`
      <div class="combobox-face face">
        ${this._renderLabel()}
        <input
          class="combobox-input"
          spellcheck="false"
          type="text"
          autocomplete="off"
          .value=${t}
          @focus=${this._onComboboxInputFocus}
          @input=${this._onComboboxInputInput}
          @click=${this._onComboboxInputClick}
        >
        <button
          class="combobox-button"
          type="button"
          @click=${this._onComboboxButtonClick}
          @keydown=${this._onComboboxButtonKeyDown}
        >
          ${qe}
        </button>
      </div>
    `}_renderOptions(){const t=this.combobox?this._filteredOptions:this._options;return L`
      <ul
        class="options"
        @click=${this._onOptionClick}
        @mouseover=${this._onOptionMouseOver}
      >
        ${Ue(t,(t=>t.index),((t,e)=>{const s=this._selectedIndexes.includes(t.index),i=At({active:e===this._activeIndex&&!t.disabled,option:!0,selected:s,disabled:t.disabled}),o=At({"checkbox-icon":!0,checked:s});return L`
              <li
                class=${i}
                data-index=${t.index}
                data-filtered-index=${e}
              >
                <span class=${o}></span>
                <span class="option-label"
                  >${t.ranges?.length?Je(t.label,t.ranges??[]):t.label}</span
                >
              </li>
            `}))}
      </ul>
    `}_renderDropdownControls(){return L`
      <div class="dropdown-controls">
        <button
          type="button"
          @click=${this._onMultiSelectAllClick}
          title="Select all"
          class="action-icon"
          id="select-all"
        >
          <vscode-icon name="checklist"></vscode-icon>
        </button>
        <button
          type="button"
          @click=${this._onMultiDeselectAllClick}
          title="Deselect all"
          class="action-icon"
          id="select-none"
        >
          <vscode-icon name="clear-all"></vscode-icon>
        </button>
        <vscode-button class="button-accept" @click=${this._onMultiAcceptClick}
          >OK</vscode-button
        >
      </div>
    `}};es.styles=Qe,es.shadowRootOptions={...rt.shadowRootOptions,delegatesFocus:!0},es.formAssociated=!0,ts([ct({type:Array,attribute:"default-value"})],es.prototype,"defaultValue",void 0),ts([ct({type:Boolean,reflect:!0})],es.prototype,"required",void 0),ts([ct({reflect:!0})],es.prototype,"name",void 0),ts([ct({type:Array,attribute:!1})],es.prototype,"selectedIndexes",null),ts([ct({type:Array})],es.prototype,"value",null),ts([ut(".face")],es.prototype,"_faceElement",void 0),es=ts([mt("vscode-multi-select")],es);const ss=[xt,n`
    :host {
      align-items: center;
      display: block;
      height: 28px;
      margin: 0;
      outline: none;
      width: 28px;
    }

    .progress {
      height: 100%;
      width: 100%;
    }

    .background {
      fill: none;
      stroke: transparent;
      stroke-width: 2px;
    }

    .indeterminate-indicator-1 {
      fill: none;
      stroke: var(--vscode-progressBar-background, #0078d4);
      stroke-width: 2px;
      stroke-linecap: square;
      transform-origin: 50% 50%;
      transform: rotate(-90deg);
      transition: all 0.2s ease-in-out;
      animation: spin-infinite 2s linear infinite;
    }

    @keyframes spin-infinite {
      0% {
        stroke-dasharray: 0.01px 43.97px;
        transform: rotate(0deg);
      }
      50% {
        stroke-dasharray: 21.99px 21.99px;
        transform: rotate(450deg);
      }
      100% {
        stroke-dasharray: 0.01px 43.97px;
        transform: rotate(1080deg);
      }
    }
  `];var is=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let os=class extends gt{constructor(){super(...arguments),this.ariaLabel="Loading",this.ariaLive="assertive",this.role="alert"}render(){return L`<svg class="progress" part="progress" viewBox="0 0 16 16">
      <circle
        class="background"
        part="background"
        cx="8px"
        cy="8px"
        r="7px"
      ></circle>
      <circle
        class="indeterminate-indicator-1"
        part="indeterminate-indicator-1"
        cx="8px"
        cy="8px"
        r="7px"
      ></circle>
    </svg>`}};os.styles=ss,is([ct({reflect:!0,attribute:"aria-label"})],os.prototype,"ariaLabel",void 0),is([ct({reflect:!0,attribute:"aria-live"})],os.prototype,"ariaLive",void 0),is([ct({reflect:!0})],os.prototype,"role",void 0),os=is([mt("vscode-progress-ring")],os);const rs=[xt,Ut,n`
    :host(:invalid) .icon,
    :host([invalid]) .icon {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    .icon {
      border-radius: 9px;
    }

    .icon.checked:before {
      background-color: currentColor;
      border-radius: 4px;
      content: '';
      height: 8px;
      left: 50%;
      margin: -4px 0 0 -4px;
      position: absolute;
      top: 50%;
      width: 8px;
    }

    :host(:focus):host(:not([disabled])) .icon {
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: -1px;
    }
  `];var ns=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let as=class extends(Lt(Tt)){constructor(){super(),this.autofocus=!1,this.checked=!1,this.defaultChecked=!1,this.invalid=!1,this.name="",this.value="",this.disabled=!1,this.required=!1,this.role="radio",this.tabIndex=0,this._slottedText="",this.type="radio",this._handleClick=()=>{this.disabled||this.checked||(this._checkButton(),this._handleValueChange(),this._dispatchCustomEvent(),this.dispatchEvent(new Event("change",{bubbles:!0})))},this._handleKeyDown=t=>{this.disabled||"Enter"!==t.key&&" "!==t.key||(t.preventDefault()," "!==t.key||this.checked||(this.checked=!0,this._handleValueChange(),this._dispatchCustomEvent(),this.dispatchEvent(new Event("change",{bubbles:!0}))),"Enter"===t.key&&this._internals.form?.requestSubmit())},this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._handleKeyDown),this.addEventListener("click",this._handleClick),this._handleValueChange()}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._handleKeyDown),this.removeEventListener("click",this._handleClick)}update(t){super.update(t),t.has("checked")&&this._handleValueChange(),t.has("required")&&this._handleValueChange()}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}formResetCallback(){this._getRadios().forEach((t=>{t.checked=t.defaultChecked})),this.updateComplete.then((()=>{this._handleValueChange()}))}formStateRestoreCallback(t,e){this.value===t&&""!==t&&(this.checked=!0)}_dispatchCustomEvent(){this.dispatchEvent(new CustomEvent("vsc-change",{detail:{checked:this.checked,label:this.label,value:this.value},bubbles:!0,composed:!0}))}_getRadios(){const t=this.getRootNode({composed:!0});if(!t)return[];const e=t.querySelectorAll(`vscode-radio[name="${this.name}"]`);return Array.from(e)}_uncheckOthers(t){t.forEach((t=>{t!==this&&(t.checked=!1)}))}_checkButton(){const t=this._getRadios();this.checked=!0,t.forEach((t=>{t!==this&&(t.checked=!1)}))}setComponentValidity(t){t?this._internals.setValidity({}):this._internals.setValidity({valueMissing:!0},"Please select one of these options.",this._inputEl)}_setGroupValidity(t,e){this.updateComplete.then((()=>{t.forEach((t=>{t.setComponentValidity(e)}))}))}_setActualFormValue(){let t="";t=this.checked?this.value?this.value:"on":null,this._internals.setFormValue(t)}_handleValueChange(){const t=this._getRadios(),e=t.some((t=>t.required));if(this._setActualFormValue(),this.checked)this._uncheckOthers(t),this._setGroupValidity(t,!0);else{const s=!!t.find((t=>t.checked)),i=e&&!s;this._setGroupValidity(t,!i)}}render(){const t=At({icon:!0,checked:this.checked}),e=At({"label-inner":!0,"is-slot-empty":""===this._slottedText});return L`
      <div class="wrapper">
        <input
          ?autofocus=${this.autofocus}
          id="input"
          class="radio"
          type="checkbox"
          ?checked=${this.checked}
          value=${this.value}
          tabindex=${this.tabIndex}
        >
        <div class=${t}></div>
        <label for="input" class="label" @click=${this._handleClick}>
          <span class=${e}>
            ${this._renderLabelAttribute()}
            <slot @slotchange=${this._handleSlotChange}></slot>
          </span>
        </label>
      </div>
    `}};as.styles=rs,as.formAssociated=!0,as.shadowRootOptions={...rt.shadowRootOptions,delegatesFocus:!0},ns([ct({type:Boolean,reflect:!0})],as.prototype,"autofocus",void 0),ns([ct({type:Boolean,reflect:!0})],as.prototype,"checked",void 0),ns([ct({type:Boolean,reflect:!0,attribute:"default-checked"})],as.prototype,"defaultChecked",void 0),ns([ct({type:Boolean,reflect:!0})],as.prototype,"invalid",void 0),ns([ct({reflect:!0})],as.prototype,"name",void 0),ns([ct()],as.prototype,"value",void 0),ns([ct({type:Boolean,reflect:!0})],as.prototype,"disabled",void 0),ns([ct({type:Boolean,reflect:!0})],as.prototype,"required",void 0),ns([ct({reflect:!0})],as.prototype,"role",void 0),ns([ct({type:Number,reflect:!0})],as.prototype,"tabIndex",void 0),ns([ht()],as.prototype,"_slottedText",void 0),ns([ut("#input")],as.prototype,"_inputEl",void 0),ns([ct()],as.prototype,"type",void 0),as=ns([mt("vscode-radio")],as);var ls=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let cs=class extends Ze{set selectedIndex(t){this._selectedIndex=t,this._value=this._options[this._selectedIndex]?this._options[this._selectedIndex].value:""}get selectedIndex(){return this._selectedIndex}set value(t){this._options[this._selectedIndex]&&(this._options[this._selectedIndex].selected=!1),this._selectedIndex=this._options.findIndex((e=>e.value===t)),this._selectedIndex>-1?(this._options[this._selectedIndex].selected=!0,this._value=t,this._requestedValueToSetLater=""):(this._value="",this._requestedValueToSetLater=t)}get value(){return this._options[this._selectedIndex]?this._options[this._selectedIndex]?.value??"":""}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}updateInputValue(){if(!this.combobox)return;const t=this.renderRoot.querySelector(".combobox-input");t&&(t.value=this._options[this._selectedIndex]?this._options[this._selectedIndex].label:"")}constructor(){super(),this.defaultValue="",this.role="listbox",this.name=void 0,this.required=!1,this._requestedValueToSetLater="",this._multiple=!1,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then((()=>{this._manageRequired()}))}formResetCallback(){this.value=this.defaultValue}formStateRestoreCallback(t,e){this.updateComplete.then((()=>{this.value=t}))}get type(){return"select-one"}get form(){return this._internals.form}_onSlotChange(){if(super._onSlotChange(),this._requestedValueToSetLater){const t=this._options.findIndex((t=>t.value===this._requestedValueToSetLater));t>0&&(this._selectedIndex=t,this._requestedValueToSetLater="")}this._selectedIndex>-1&&this._options.length>0?this._internals.setFormValue(this._options[this._selectedIndex].value):this._internals.setFormValue(null)}_onArrowUpKeyDown(){super._onArrowUpKeyDown(),this.open||this._selectedIndex<=0||(this._filterPattern="",this._selectedIndex-=1,this._activeIndex=this._selectedIndex,this._value=this._options[this._selectedIndex].value,this._internals.setFormValue(this._value),this._manageRequired(),this._dispatchChangeEvent())}_onArrowDownKeyDown(){super._onArrowDownKeyDown(),this.open||this._selectedIndex>=this._options.length-1||(this._filterPattern="",this._selectedIndex+=1,this._activeIndex=this._selectedIndex,this._value=this._options[this._selectedIndex].value,this._internals.setFormValue(this._value),this._manageRequired(),this._dispatchChangeEvent())}_onEnterKeyDown(){super._onEnterKeyDown(),this.updateInputValue(),this._internals.setFormValue(this._value),this._manageRequired()}_onOptionClick(t){const e=t.composedPath().find((t=>t?.matches("li.option")));e&&!e.matches(".disabled")&&(this._selectedIndex=Number(e.dataset.index),this._value=this._options[this._selectedIndex].value,this._toggleDropdown(!1),this._internals.setFormValue(this._value),this._manageRequired(),this._dispatchChangeEvent())}_manageRequired(){const{value:t}=this;""===t&&this.required?this._internals.setValidity({valueMissing:!0},"Please select an item in the list.",this._face):this._internals.setValidity({})}_renderSelectFace(){const t=this._options[this._selectedIndex]?.label??"";return L`
      <div
        class="select-face face"
        @click=${this._onFaceClick}
        tabindex=${this.tabIndex>-1?0:-1}
      >
        <span class="text">${t}</span> ${qe}
      </div>
    `}_renderComboboxFace(){const t=this._selectedIndex>-1?this._options[this._selectedIndex].label:"";return L`
      <div class="combobox-face face">
        <input
          class="combobox-input"
          spellcheck="false"
          type="text"
          autocomplete="off"
          .value=${t}
          @focus=${this._onComboboxInputFocus}
          @input=${this._onComboboxInputInput}
          @click=${this._onComboboxInputClick}
        >
        <button
          class="combobox-button"
          type="button"
          @click=${this._onComboboxButtonClick}
          @keydown=${this._onComboboxButtonKeyDown}
        >
          ${qe}
        </button>
      </div>
    `}_renderOptions(){const t=(this.combobox?this._filteredOptions:this._options).map(((t,e)=>{const s=At({option:!0,disabled:t.disabled,selected:t.selected,active:e===this._activeIndex&&!t.disabled});return L`
        <li
          class=${s}
          data-index=${t.index}
          data-filtered-index=${e}
        >
          ${t.ranges?.length?Je(t.label,t.ranges??[]):t.label}
        </li>
      `}));return L`
      <ul
        class="options"
        @mouseover=${this._onOptionMouseOver}
        @click=${this._onOptionClick}
      >
        ${t}
      </ul>
    `}};cs.styles=Qe,cs.shadowRootOptions={...rt.shadowRootOptions,delegatesFocus:!0},cs.formAssociated=!0,ls([ct({attribute:"default-value"})],cs.prototype,"defaultValue",void 0),ls([ct({type:String,attribute:!0,reflect:!0})],cs.prototype,"role",void 0),ls([ct({reflect:!0})],cs.prototype,"name",void 0),ls([ct({type:Number,attribute:"selected-index"})],cs.prototype,"selectedIndex",null),ls([ct({type:String})],cs.prototype,"value",null),ls([ct({type:Boolean,reflect:!0})],cs.prototype,"required",void 0),ls([ut(".face")],cs.prototype,"_face",void 0),cs=ls([mt("vscode-single-select")],cs);const hs=[xt,n`
    :host {
      display: block;
      position: relative;
    }

    .scrollable-container {
      height: 100%;
      overflow: auto;
    }

    .scrollable-container::-webkit-scrollbar {
      cursor: default;
      width: 0;
    }

    .scrollable-container {
      scrollbar-width: none;
    }

    .shadow {
      box-shadow: var(--vscode-scrollbar-shadow, #000000) 0 6px 6px -6px inset;
      display: none;
      height: 3px;
      left: 0;
      pointer-events: none;
      position: absolute;
      top: 0;
      z-index: 1;
      width: 100%;
    }

    .shadow.visible {
      display: block;
    }

    .scrollbar-track {
      height: 100%;
      position: absolute;
      right: 0;
      top: 0;
      width: 10px;
      z-index: 100;
    }

    .scrollbar-track.hidden {
      display: none;
    }

    .scrollbar-thumb {
      background-color: transparent;
      min-height: var(--min-thumb-height, 20px);
      opacity: 0;
      position: absolute;
      right: 0;
      width: 10px;
    }

    .scrollbar-thumb.visible {
      background-color: var(
        --vscode-scrollbarSlider-background,
        rgba(121, 121, 121, 0.4)
      );
      opacity: 1;
      transition: opacity 100ms;
    }

    .scrollbar-thumb.fade {
      background-color: var(
        --vscode-scrollbarSlider-background,
        rgba(121, 121, 121, 0.4)
      );
      opacity: 0;
      transition: opacity 800ms;
    }

    .scrollbar-thumb.visible:hover {
      background-color: var(
        --vscode-scrollbarSlider-hoverBackground,
        rgba(100, 100, 100, 0.7)
      );
    }

    .scrollbar-thumb.visible.active,
    .scrollbar-thumb.visible.active:hover {
      background-color: var(
        --vscode-scrollbarSlider-activeBackground,
        rgba(191, 191, 191, 0.4)
      );
    }

    .prevent-interaction {
      bottom: 0;
      left: 0;
      right: 0;
      top: 0;
      position: absolute;
      z-index: 99;
    }

    .content {
      overflow: hidden;
    }
  `];var ds=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let us=class extends gt{constructor(){super(...arguments),this.shadow=!0,this.scrolled=!1,this._isDragging=!1,this._thumbHeight=0,this._thumbY=0,this._thumbVisible=!1,this._thumbFade=!1,this._thumbActive=!1,this._scrollThumbStartY=0,this._mouseStartY=0,this._scrollbarVisible=!0,this._scrollbarTrackZ=0,this._resizeObserverCallback=()=>{this._updateScrollbar()},this._onSlotChange=()=>{this._zIndexFix()},this._onScrollThumbMouseMoveBound=this._onScrollThumbMouseMove.bind(this),this._onScrollThumbMouseUpBound=this._onScrollThumbMouseUp.bind(this),this._onComponentMouseOverBound=this._onComponentMouseOver.bind(this),this._onComponentMouseOutBound=this._onComponentMouseOut.bind(this)}set scrollPos(t){this._scrollableContainer.scrollTop=t}get scrollPos(){return this._scrollableContainer?this._scrollableContainer.scrollTop:0}get scrollMax(){return this._scrollableContainer?this._scrollableContainer.scrollHeight:0}connectedCallback(){super.connectedCallback(),this._hostResizeObserver=new ResizeObserver(this._resizeObserverCallback),this._contentResizeObserver=new ResizeObserver(this._resizeObserverCallback),this.requestUpdate(),this.updateComplete.then((()=>{this._scrollableContainer.addEventListener("scroll",this._onScrollableContainerScroll.bind(this)),this._hostResizeObserver.observe(this),this._contentResizeObserver.observe(this._contentElement)})),this.addEventListener("mouseover",this._onComponentMouseOverBound),this.addEventListener("mouseout",this._onComponentMouseOutBound)}disconnectedCallback(){super.disconnectedCallback(),this._hostResizeObserver.unobserve(this),this._hostResizeObserver.disconnect(),this._contentResizeObserver.unobserve(this._contentElement),this._contentResizeObserver.disconnect(),this.removeEventListener("mouseover",this._onComponentMouseOverBound),this.removeEventListener("mouseout",this._onComponentMouseOutBound)}_updateScrollbar(){const t=this.getBoundingClientRect(),e=this._contentElement.getBoundingClientRect();t.height>=e.height?this._scrollbarVisible=!1:(this._scrollbarVisible=!0,this._thumbHeight=t.height*(t.height/e.height)),this.requestUpdate()}_zIndexFix(){let t=0;this._assignedElements.forEach((e=>{if("style"in e){const s=window.getComputedStyle(e).zIndex;/([0-9-])+/g.test(s)&&(t=Number(s)>t?Number(s):t)}})),this._scrollbarTrackZ=t+1,this.requestUpdate()}_onScrollThumbMouseDown(t){const e=this.getBoundingClientRect(),s=this._scrollThumbElement.getBoundingClientRect();this._mouseStartY=t.screenY,this._scrollThumbStartY=s.top-e.top,this._isDragging=!0,this._thumbActive=!0,document.addEventListener("mousemove",this._onScrollThumbMouseMoveBound),document.addEventListener("mouseup",this._onScrollThumbMouseUpBound)}_onScrollThumbMouseMove(t){const e=this._scrollThumbStartY+(t.screenY-this._mouseStartY);let s=0;const i=this.getBoundingClientRect().height,o=this._scrollThumbElement.getBoundingClientRect().height,r=this._contentElement.getBoundingClientRect().height;s=e<0?0:e>i-o?i-o:e,this._thumbY=s,this._scrollableContainer.scrollTop=s/(i-o)*(r-i)}_onScrollThumbMouseUp(t){this._isDragging=!1,this._thumbActive=!1;const e=this.getBoundingClientRect(),{x:s,y:i,width:o,height:r}=e,{pageX:n,pageY:a}=t;(n>s+o||n<s||a>i+r||a<i)&&(this._thumbFade=!0,this._thumbVisible=!1),document.removeEventListener("mousemove",this._onScrollThumbMouseMoveBound),document.removeEventListener("mouseup",this._onScrollThumbMouseUpBound)}_onScrollableContainerScroll(){const t=this._scrollableContainer.scrollTop;this.scrolled=t>0;const e=this.getBoundingClientRect().height,s=this._scrollThumbElement.getBoundingClientRect().height,i=t/(this._contentElement.getBoundingClientRect().height-e);this._thumbY=i*(e-s)}_onComponentMouseOver(){this._thumbVisible=!0,this._thumbFade=!1}_onComponentMouseOut(){this._thumbActive||(this._thumbVisible=!1,this._thumbFade=!0)}render(){return L`
      <div
        class="scrollable-container"
        .style=${Ot({userSelect:this._isDragging?"none":"auto"})}
      >
        <div
          class=${At({shadow:!0,visible:this.scrolled})}
          .style=${Ot({zIndex:String(this._scrollbarTrackZ)})}
        ></div>
        ${this._isDragging?L`<div class="prevent-interaction"></div>`:q}
        <div
          class=${At({"scrollbar-track":!0,hidden:!this._scrollbarVisible})}
        >
          <div
            class=${At({"scrollbar-thumb":!0,visible:this._thumbVisible,fade:this._thumbFade,active:this._thumbActive})}
            .style=${Ot({height:`${this._thumbHeight}px`,top:`${this._thumbY}px`})}
            @mousedown=${this._onScrollThumbMouseDown}
          ></div>
        </div>
        <div class="content">
          <slot @slotchange=${this._onSlotChange}></slot>
        </div>
      </div>
    `}};us.styles=hs,ds([ct({type:Boolean,reflect:!0})],us.prototype,"shadow",void 0),ds([ct({type:Boolean,reflect:!0})],us.prototype,"scrolled",void 0),ds([ct({type:Number,attribute:"scroll-pos"})],us.prototype,"scrollPos",null),ds([ct({type:Number,attribute:"scroll-max"})],us.prototype,"scrollMax",null),ds([ht()],us.prototype,"_isDragging",void 0),ds([ht()],us.prototype,"_thumbHeight",void 0),ds([ht()],us.prototype,"_thumbY",void 0),ds([ht()],us.prototype,"_thumbVisible",void 0),ds([ht()],us.prototype,"_thumbFade",void 0),ds([ht()],us.prototype,"_thumbActive",void 0),ds([ut(".content")],us.prototype,"_contentElement",void 0),ds([ut(".scrollbar-thumb",!0)],us.prototype,"_scrollThumbElement",void 0),ds([ut(".scrollable-container")],us.prototype,"_scrollableContainer",void 0),ds([vt()],us.prototype,"_assignedElements",void 0),us=ds([mt("vscode-scrollable")],us);const ps=[xt,n`
    :host {
      --separator-border: var(--vscode-editorWidget-border, transparent);

      border: 1px solid var(--vscode-editorWidget-border);
      display: block;
      overflow: hidden;
      position: relative;
    }

    ::slotted(*) {
      height: 100%;
      width: 100%;
    }

    ::slotted(vscode-split-layout) {
      border: 0;
    }

    .wrapper {
      display: flex;
      height: 100%;
      width: 100%;
    }

    .wrapper.horizontal {
      flex-direction: column;
    }

    .start {
      box-sizing: border-box;
      flex: 1;
      min-height: 0;
      min-width: 0;
    }

    :host([split='vertical']) .start {
      border-right: 1px solid var(--separator-border);
    }

    :host([split='horizontal']) .start {
      border-bottom: 1px solid var(--separator-border);
    }

    .end {
      flex: 1;
      min-height: 0;
      min-width: 0;
    }

    :host([split='vertical']) .start,
    :host([split='vertical']) .end {
      height: 100%;
    }

    :host([split='horizontal']) .start,
    :host([split='horizontal']) .end {
      width: 100%;
    }

    .handle-overlay {
      display: none;
      height: 100%;
      left: 0;
      position: absolute;
      top: 0;
      width: 100%;
      z-index: 1;
    }

    .handle-overlay.active {
      display: block;
    }

    .handle-overlay.split-vertical {
      cursor: ew-resize;
    }

    .handle-overlay.split-horizontal {
      cursor: ns-resize;
    }

    .handle {
      background-color: transparent;
      position: absolute;
      z-index: 2;
    }

    .handle.hover {
      transition: background-color 0.1s ease-out 0.3s;
      background-color: var(--vscode-sash-hoverBorder);
    }

    .handle.hide {
      background-color: transparent;
      transition: background-color 0.1s ease-out;
    }

    .handle.split-vertical {
      cursor: ew-resize;
      height: 100%;
    }

    .handle.split-horizontal {
      cursor: ns-resize;
      width: 100%;
    }
  `];var vs,bs=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};const fs=t=>{if(!t)return{value:0,unit:"pixel"};let e,s;t.endsWith("%")?(e="percent",s=+t.substring(0,t.length-1)):t.endsWith("px")?(e="pixel",s=+t.substring(0,t.length-2)):(e="pixel",s=+t);return{unit:e,value:isNaN(s)?0:s}},gs=(t,e)=>0===e?0:Math.min(100,t/e*100),ms=(t,e)=>e*(t/100);let xs=vs=class extends gt{set split(t){this._split!==t&&(this._split=t,this.resetHandlePosition())}get split(){return this._split}set handlePosition(t){this._rawHandlePosition=t,this._handlePositionPropChanged()}get handlePosition(){return this._rawHandlePosition}set fixedPane(t){this._fixedPane=t,this._fixedPanePropChanged()}get fixedPane(){return this._fixedPane}constructor(){super(),this._split="vertical",this.resetOnDblClick=!1,this.handleSize=4,this.initialHandlePosition="50%",this._fixedPane="none",this._handlePosition=0,this._isDragActive=!1,this._hover=!1,this._hide=!1,this._boundRect=new DOMRect,this._handleOffset=0,this._wrapperObserved=!1,this._fixedPaneSize=0,this._handleResize=t=>{const e=t[0].contentRect,{width:s,height:i}=e;this._boundRect=e;const o="vertical"===this.split?s:i;"start"===this.fixedPane&&(this._handlePosition=this._fixedPaneSize),"end"===this.fixedPane&&(this._handlePosition=o-this._fixedPaneSize)},this._handleMouseUp=t=>{this._isDragActive=!1,t.target!==this&&(this._hover=!1,this._hide=!0),window.removeEventListener("mouseup",this._handleMouseUp),window.removeEventListener("mousemove",this._handleMouseMove);const{width:e,height:s}=this._boundRect,i="vertical"===this.split?e:s,o=gs(this._handlePosition,i);this.dispatchEvent(new CustomEvent("vsc-split-layout-change",{detail:{position:this._handlePosition,positionInPercentage:o},composed:!0}))},this._handleMouseMove=t=>{const{clientX:e,clientY:s}=t,{left:i,top:o,height:r,width:n}=this._boundRect,a="vertical"===this.split,l=a?n:r,c=a?e-i:s-o;this._handlePosition=Math.max(0,Math.min(c-this._handleOffset+this.handleSize/2,l)),"start"===this.fixedPane&&(this._fixedPaneSize=this._handlePosition),"end"===this.fixedPane&&(this._fixedPaneSize=l-this._handlePosition)},this._resizeObserver=new ResizeObserver(this._handleResize)}resetHandlePosition(){if(!this._wrapperEl)return void(this._handlePosition=0);const{width:t,height:e}=this._wrapperEl.getBoundingClientRect(),s="vertical"===this.split?t:e,{value:i,unit:o}=fs(this.initialHandlePosition??"50%");this._handlePosition="percent"===o?ms(i,s):i}connectedCallback(){super.connectedCallback()}firstUpdated(t){"none"!==this.fixedPane&&(this._resizeObserver.observe(this._wrapperEl),this._wrapperObserved=!0),this._boundRect=this._wrapperEl.getBoundingClientRect();const{value:e,unit:s}=this.handlePosition?fs(this.handlePosition):fs(this.initialHandlePosition);this._setPosition(e,s),this._initFixedPane()}_handlePositionPropChanged(){if(this.handlePosition&&this._wrapperEl){this._boundRect=this._wrapperEl.getBoundingClientRect();const{value:t,unit:e}=fs(this.handlePosition);this._setPosition(t,e)}}_fixedPanePropChanged(){this._wrapperEl&&this._initFixedPane()}_initFixedPane(){if("none"===this.fixedPane)this._wrapperObserved&&(this._resizeObserver.unobserve(this._wrapperEl),this._wrapperObserved=!1);else{const{width:t,height:e}=this._boundRect,s="vertical"===this.split?t:e;this._fixedPaneSize="start"===this.fixedPane?this._handlePosition:s-this._handlePosition,this._wrapperObserved||(this._resizeObserver.observe(this._wrapperEl),this._wrapperObserved=!0)}}_setPosition(t,e){const{width:s,height:i}=this._boundRect,o="vertical"===this.split?s:i;this._handlePosition="percent"===e?ms(t,o):t}_handleMouseOver(){this._hover=!0,this._hide=!1}_handleMouseOut(t){1!==t.buttons&&(this._hover=!1,this._hide=!0)}_handleMouseDown(t){t.stopPropagation(),t.preventDefault(),this._boundRect=this._wrapperEl.getBoundingClientRect();const{left:e,top:s}=this._boundRect,{left:i,top:o}=this._handleEl.getBoundingClientRect(),r=t.clientX-e,n=t.clientY-s;"vertical"===this.split&&(this._handleOffset=r-(i-e)),"horizontal"===this.split&&(this._handleOffset=n-(o-s)),this._isDragActive=!0,window.addEventListener("mouseup",this._handleMouseUp),window.addEventListener("mousemove",this._handleMouseMove)}_handleDblClick(){this.resetOnDblClick&&this.resetHandlePosition()}_handleSlotChange(){[...this._nestedLayoutsAtStart,...this._nestedLayoutsAtEnd].forEach((t=>{t instanceof vs&&t.resetHandlePosition()}))}render(){const{width:t,height:e}=this._boundRect,s="vertical"===this.split?t:e,i="none"!==this.fixedPane?`${this._handlePosition}px`:`${gs(this._handlePosition,s)}%`;let o="";o="start"===this.fixedPane?`0 0 ${this._fixedPaneSize}px`:`1 1 ${gs(this._handlePosition,s)}%`;let r="";r="end"===this.fixedPane?`0 0 ${this._fixedPaneSize}px`:`1 1 ${gs(s-this._handlePosition,s)}%`;const n={left:"vertical"===this.split?i:"0",top:"vertical"===this.split?"0":i},a=this.handleSize??4;"vertical"===this.split&&(n.marginLeft=0-a/2+"px",n.width=`${a}px`),"horizontal"===this.split&&(n.height=`${a}px`,n.marginTop=0-a/2+"px");const l=At({"handle-overlay":!0,active:this._isDragActive,"split-vertical":"vertical"===this.split,"split-horizontal":"horizontal"===this.split}),c=At({handle:!0,hover:this._hover,hide:this._hide,"split-vertical":"vertical"===this.split,"split-horizontal":"horizontal"===this.split}),h={wrapper:!0,horizontal:"horizontal"===this.split};return L`
      <div class=${At(h)}>
        <div class="start" .style=${Ot({flex:o})}>
          <slot name="start" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class="end" .style=${Ot({flex:r})}>
          <slot name="end" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class=${l}></div>
        <div
          class=${c}
          .style=${Ot(n)}
          @mouseover=${this._handleMouseOver}
          @mouseout=${this._handleMouseOut}
          @mousedown=${this._handleMouseDown}
          @dblclick=${this._handleDblClick}
        ></div>
      </div>
    `}};xs.styles=ps,bs([ct({reflect:!0})],xs.prototype,"split",null),bs([ct({type:Boolean,reflect:!0,attribute:"reset-on-dbl-click"})],xs.prototype,"resetOnDblClick",void 0),bs([ct({type:Number,reflect:!0,attribute:"handle-size"})],xs.prototype,"handleSize",void 0),bs([ct({reflect:!0,attribute:"initial-handle-position"})],xs.prototype,"initialHandlePosition",void 0),bs([ct({attribute:"handle-position"})],xs.prototype,"handlePosition",null),bs([ct({attribute:"fixed-pane"})],xs.prototype,"fixedPane",null),bs([ht()],xs.prototype,"_handlePosition",void 0),bs([ht()],xs.prototype,"_isDragActive",void 0),bs([ht()],xs.prototype,"_hover",void 0),bs([ht()],xs.prototype,"_hide",void 0),bs([ut(".wrapper")],xs.prototype,"_wrapperEl",void 0),bs([ut(".handle")],xs.prototype,"_handleEl",void 0),bs([vt({slot:"start",selector:"vscode-split-layout"})],xs.prototype,"_nestedLayoutsAtStart",void 0),bs([vt({slot:"end",selector:"vscode-split-layout"})],xs.prototype,"_nestedLayoutsAtEnd",void 0),xs=vs=bs([mt("vscode-split-layout")],xs);const ys=[xt,n`
    :host {
      border-bottom: 1px solid transparent;
      cursor: pointer;
      display: block;
      margin-bottom: -1px;
      overflow: hidden;
      padding: 7px 8px;
      text-overflow: ellipsis;
      user-select: none;
      white-space: nowrap;
    }

    :host([active]) {
      border-bottom-color: var(--vscode-panelTitle-activeForeground);
      color: var(--vscode-panelTitle-activeForeground);
    }

    :host([panel]) {
      border-bottom: 0;
      margin-bottom: 0;
      padding: 0;
    }

    :host(:focus-visible) {
      outline: none;
    }

    .wrapper {
      align-items: center;
      color: var(--vscode-foreground);
      display: flex;
      min-height: 20px;
      overflow: inherit;
      text-overflow: inherit;
      position: relative;
    }

    .wrapper.panel {
      color: var(--vscode-panelTitle-inactiveForeground);
    }

    .wrapper.panel.active,
    .wrapper.panel:hover {
      color: var(--vscode-panelTitle-activeForeground);
    }

    :host([panel]) .wrapper {
      display: flex;
      font-size: 11px;
      height: 31px;
      padding: 2px 10px;
      text-transform: uppercase;
    }

    .main {
      overflow: inherit;
      text-overflow: inherit;
    }

    .active-indicator {
      display: none;
    }

    .active-indicator.panel.active {
      border-top: 1px solid var(--vscode-panelTitle-activeBorder);
      bottom: 4px;
      display: block;
      left: 8px;
      pointer-events: none;
      position: absolute;
      right: 8px;
    }

    :host(:focus-visible) .wrapper {
      outline-color: var(--vscode-focusBorder);
      outline-offset: 3px;
      outline-style: solid;
      outline-width: 1px;
    }

    :host(:focus-visible) .wrapper.panel {
      outline-offset: -2px;
    }

    slot[name='content-before']::slotted(vscode-badge) {
      margin-right: 8px;
    }

    slot[name='content-after']::slotted(vscode-badge) {
      margin-left: 8px;
    }
  `];var ws=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let ks=class extends gt{constructor(){super(...arguments),this.active=!1,this.ariaControls="",this.panel=!1,this.role="tab",this.tabId=-1}attributeChangedCallback(t,e,s){if(super.attributeChangedCallback(t,e,s),"active"===t){const t=null!==s;this.ariaSelected=t?"true":"false",this.tabIndex=t?0:-1}}render(){return L`
      <div
        class=${At({wrapper:!0,active:this.active,panel:this.panel})}
      >
        <div class="before"><slot name="content-before"></slot></div>
        <div class="main"><slot></slot></div>
        <div class="after"><slot name="content-after"></slot></div>
        <span
          class=${At({"active-indicator":!0,active:this.active,panel:this.panel})}
        ></span>
      </div>
    `}};ks.styles=ys,ws([ct({type:Boolean,reflect:!0})],ks.prototype,"active",void 0),ws([ct({reflect:!0,attribute:"aria-controls"})],ks.prototype,"ariaControls",void 0),ws([ct({type:Boolean,reflect:!0})],ks.prototype,"panel",void 0),ws([ct({reflect:!0})],ks.prototype,"role",void 0),ws([ct({type:Number,reflect:!0,attribute:"tab-id"})],ks.prototype,"tabId",void 0),ks=ws([mt("vscode-tab-header")],ks);const $s=[xt,n`
    :host {
      display: block;
      overflow: hidden;
    }

    :host(:focus-visible) {
      outline-color: var(--vscode-focusBorder);
      outline-offset: 3px;
      outline-style: solid;
      outline-width: 1px;
    }

    :host([panel]) {
      background-color: var(--vscode-panel-background);
    }
  `];var _s=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Cs=class extends gt{constructor(){super(...arguments),this.hidden=!1,this.ariaLabelledby="",this.panel=!1,this.role="tabpanel",this.tabIndex=0}render(){return L` <slot></slot> `}};Cs.styles=$s,_s([ct({type:Boolean,reflect:!0})],Cs.prototype,"hidden",void 0),_s([ct({reflect:!0,attribute:"aria-labelledby"})],Cs.prototype,"ariaLabelledby",void 0),_s([ct({type:Boolean,reflect:!0})],Cs.prototype,"panel",void 0),_s([ct({reflect:!0})],Cs.prototype,"role",void 0),_s([ct({type:Number,reflect:!0})],Cs.prototype,"tabIndex",void 0),Cs=_s([mt("vscode-tab-panel")],Cs);const Bs=[xt,n`
    :host {
      display: table;
      table-layout: fixed;
      width: 100%;
    }

    ::slotted(vscode-table-row:nth-child(even)) {
      background-color: var(--vsc-row-even-background);
    }

    ::slotted(vscode-table-row:nth-child(odd)) {
      background-color: var(--vsc-row-odd-background);
    }
  `];var Ss=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let zs=class extends gt{constructor(){super(...arguments),this.role="rowgroup"}render(){return L` <slot></slot> `}};zs.styles=Bs,Ss([ct({reflect:!0})],zs.prototype,"role",void 0),zs=Ss([mt("vscode-table-body")],zs);const As=[xt,n`
    :host {
      border-bottom-color: var(--vscode-editorGroup-border);
      border-bottom-style: solid;
      border-bottom-width: var(--vsc-row-border-bottom-width);
      box-sizing: border-box;
      color: var(--vscode-foreground);
      display: table-cell;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      height: 24px;
      overflow: hidden;
      padding-left: 10px;
      text-overflow: ellipsis;
      vertical-align: middle;
      white-space: nowrap;
    }

    :host([compact]) {
      display: block;
      height: auto;
      padding-bottom: 5px;
      width: 100% !important;
    }

    :host([compact]:first-child) {
      padding-top: 10px;
    }

    :host([compact]:last-child) {
      padding-bottom: 10px;
    }

    .wrapper {
      overflow: inherit;
      text-overflow: inherit;
      white-space: inherit;
      width: 100%;
    }

    .column-label {
      font-weight: bold;
    }
  `];var Es=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Os=class extends gt{constructor(){super(...arguments),this.role="cell",this.columnLabel="",this.compact=!1}render(){const t=this.columnLabel?L`<div class="column-label" role="presentation">
          ${this.columnLabel}
        </div>`:q;return L`
      <div class="wrapper">
        ${t}
        <slot></slot>
      </div>
    `}};Os.styles=As,Es([ct({reflect:!0})],Os.prototype,"role",void 0),Es([ct({attribute:"column-label"})],Os.prototype,"columnLabel",void 0),Es([ct({type:Boolean,reflect:!0})],Os.prototype,"compact",void 0),Os=Es([mt("vscode-table-cell")],Os);const js=[xt,n`
    :host {
      background-color: var(--vscode-keybindingTable-headerBackground);
      display: table;
      table-layout: fixed;
      width: 100%;
    }
  `];var Is=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Ms=class extends gt{constructor(){super(...arguments),this.role="rowgroup"}render(){return L` <slot></slot> `}};Ms.styles=js,Is([ct({reflect:!0})],Ms.prototype,"role",void 0),Ms=Is([mt("vscode-table-header")],Ms);const Fs=[xt,n`
    :host {
      box-sizing: border-box;
      color: var(--vscode-foreground);
      display: table-cell;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: bold;
      line-height: 20px;
      overflow: hidden;
      padding-bottom: 5px;
      padding-left: 10px;
      padding-right: 0;
      padding-top: 5px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wrapper {
      box-sizing: inherit;
      overflow: inherit;
      text-overflow: inherit;
      white-space: inherit;
      width: 100%;
    }
  `];var Ps=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Ds=class extends gt{constructor(){super(...arguments),this.role="columnheader"}render(){return L`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};Ds.styles=Fs,Ps([ct({reflect:!0})],Ds.prototype,"role",void 0),Ds=Ps([mt("vscode-table-header-cell")],Ds);const Ns=[xt,n`
    :host {
      border-top-color: var(--vscode-editorGroup-border);
      border-top-style: solid;
      border-top-width: var(--vsc-row-border-top-width);
      display: var(--vsc-row-display);
      width: 100%;
    }
  `];var Vs=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Ts=class extends gt{constructor(){super(...arguments),this.role="row"}render(){return L` <slot></slot> `}};Ts.styles=Ns,Vs([ct({reflect:!0})],Ts.prototype,"role",void 0),Ts=Vs([mt("vscode-table-row")],Ts);const Rs=(t,e)=>{if("number"!=typeof t||Number.isNaN(t)){if("string"==typeof t&&/^[0-9.]+$/.test(t)){return Number(t)/e*100}if("string"==typeof t&&/^[0-9.]+%$/.test(t))return Number(t.substring(0,t.length-1));if("string"==typeof t&&/^[0-9.]+px$/.test(t)){return Number(t.substring(0,t.length-2))/e*100}return null}return t/e*100},Ls=[xt,n`
    :host {
      display: block;
      --vsc-row-even-background: transparent;
      --vsc-row-odd-background: transparent;
      --vsc-row-border-bottom-width: 0;
      --vsc-row-border-top-width: 0;
      --vsc-row-display: table-row;
    }

    :host([bordered]),
    :host([bordered-rows]) {
      --vsc-row-border-bottom-width: 1px;
    }

    :host([compact]) {
      --vsc-row-display: block;
    }

    :host([bordered][compact]),
    :host([bordered-rows][compact]) {
      --vsc-row-border-bottom-width: 0;
      --vsc-row-border-top-width: 1px;
    }

    :host([zebra]) {
      --vsc-row-even-background: var(--vscode-keybindingTable-rowsBackground);
    }

    :host([zebra-odd]) {
      --vsc-row-odd-background: var(--vscode-keybindingTable-rowsBackground);
    }

    ::slotted(vscode-table-row) {
      width: 100%;
    }

    .wrapper {
      height: 100%;
      max-width: 100%;
      overflow: hidden;
      position: relative;
      width: 100%;
    }

    .wrapper.select-disabled {
      user-select: none;
    }

    .wrapper.resize-cursor {
      cursor: ew-resize;
    }

    .wrapper.compact-view .header-slot-wrapper {
      height: 0;
      overflow: hidden;
    }

    .scrollable {
      height: 100%;
    }

    .scrollable:before {
      background-color: transparent;
      content: '';
      display: block;
      height: 1px;
      position: absolute;
      width: 100%;
    }

    .wrapper:not(.compact-view) .scrollable:not([scrolled]):before {
      background-color: var(--vscode-editorGroup-border);
    }

    .sash {
      visibility: hidden;
    }

    :host([bordered-columns]) .sash,
    :host([bordered]) .sash {
      visibility: visible;
    }

    :host([resizable]) .wrapper:hover .sash {
      visibility: visible;
    }

    .sash {
      height: 100%;
      position: absolute;
      top: 0;
      width: 1px;
    }

    .wrapper.compact-view .sash {
      display: none;
    }

    .sash.resizable {
      cursor: ew-resize;
    }

    .sash-visible {
      background-color: var(--vscode-editorGroup-border);
      height: 100%;
      position: absolute;
      top: 30px;
      width: 1px;
    }

    .sash.hover .sash-visible {
      background-color: var(--vscode-sash-hoverBorder);
      transition: background-color 50ms linear 300ms;
    }

    .sash .sash-clickable {
      background-color: transparent;
      height: 100%;
      left: -2px;
      position: absolute;
      width: 5px;
    }
  `];var Us=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let qs=class extends gt{constructor(){super(...arguments),this.role="table",this.resizable=!1,this.responsive=!1,this.bordered=!1,this.borderedColumns=!1,this.borderedRows=!1,this.breakpoint=300,this.minColumnWidth="50px",this.delayedResizing=!1,this.compact=!1,this.zebra=!1,this.zebraOdd=!1,this._sashPositions=[],this._isDragging=!1,this._sashHovers=[],this._columns=[],this._activeSashElementIndex=-1,this._activeSashCursorOffset=0,this._componentX=0,this._componentH=0,this._componentW=0,this._headerCells=[],this._cellsOfFirstRow=[],this._prevHeaderHeight=0,this._prevComponentHeight=0,this._componentResizeObserverCallback=()=>{this._memoizeComponentDimensions(),this._updateResizeHandlersSize(),this.responsive&&this._toggleCompactView()},this._headerResizeObserverCallback=()=>{this._updateResizeHandlersSize()},this._bodyResizeObserverCallback=()=>{let t=0,e=0;const s=this.getBoundingClientRect().height;this._assignedHeaderElements&&this._assignedHeaderElements.length&&(t=this._assignedHeaderElements[0].getBoundingClientRect().height),this._assignedBodyElements&&this._assignedBodyElements.length&&(e=this._assignedBodyElements[0].getBoundingClientRect().height);const i=e-t-s;this._scrollableElement.style.height=i>0?s-t+"px":"auto"},this._onResizingMouseMove=t=>{t.stopPropagation(),this._updateActiveSashPosition(t.pageX),this.delayedResizing?this._resizeColumns(!1):this._resizeColumns(!0)},this._onResizingMouseUp=t=>{this._resizeColumns(!0),this._updateActiveSashPosition(t.pageX),this._sashHovers[this._activeSashElementIndex]=!1,this._isDragging=!1,this._activeSashElementIndex=-1,document.removeEventListener("mousemove",this._onResizingMouseMove),document.removeEventListener("mouseup",this._onResizingMouseUp)}}set columns(t){this._columns=t,this.isConnected&&this._initDefaultColumnSizes()}get columns(){return this._columns}connectedCallback(){super.connectedCallback(),this._memoizeComponentDimensions(),this._initDefaultColumnSizes()}disconnectedCallback(){super.disconnectedCallback(),this._componentResizeObserver?.unobserve(this),this._componentResizeObserver?.disconnect(),this._bodyResizeObserver?.disconnect()}_px2Percent(t){return t/this._componentW*100}_percent2Px(t){return this._componentW*t/100}_memoizeComponentDimensions(){const t=this.getBoundingClientRect();this._componentH=t.height,this._componentW=t.width,this._componentX=t.x}_queryHeaderCells(){const t=this._assignedHeaderElements;return t&&t[0]?Array.from(t[0].querySelectorAll("vscode-table-header-cell")):[]}_getHeaderCells(){return this._headerCells.length||(this._headerCells=this._queryHeaderCells()),this._headerCells}_queryCellsOfFirstRow(){const t=this._assignedBodyElements;return t&&t[0]?Array.from(t[0].querySelectorAll("vscode-table-row:first-child vscode-table-cell")):[]}_getCellsOfFirstRow(){return this._cellsOfFirstRow.length||(this._cellsOfFirstRow=this._queryCellsOfFirstRow()),this._cellsOfFirstRow}_initResizeObserver(){this._componentResizeObserver=new ResizeObserver(this._componentResizeObserverCallback),this._componentResizeObserver.observe(this),this._headerResizeObserver=new ResizeObserver(this._headerResizeObserverCallback),this._headerResizeObserver.observe(this._headerElement)}_calcColWidthPercentages(){const t=this._getHeaderCells().length;let e=this.columns.slice(0,t);const s=e.filter((t=>"auto"===t)).length+t-e.length;let i=100;if(e=e.map((t=>{const e=Rs(t,this._componentW);return null===e?"auto":(i-=e,e)})),e.length<t)for(let s=e.length;s<t;s++)e.push("auto");return e=e.map((t=>"auto"===t?i/s:t)),e}_initHeaderCellSizes(t){this._getHeaderCells().forEach(((e,s)=>{e.style.width=`${t[s]}%`}))}_initBodyColumnSizes(t){this._getCellsOfFirstRow().forEach(((e,s)=>{e.style.width=`${t[s]}%`}))}_initSashes(t){const e=t.length;let s=0;this._sashPositions=[],t.forEach(((t,i)=>{if(i<e-1){const e=s+t;this._sashPositions.push(e),s=e}}))}_initDefaultColumnSizes(){const t=this._calcColWidthPercentages();this._initHeaderCellSizes(t),this._initBodyColumnSizes(t),this._initSashes(t)}_updateResizeHandlersSize(){const t=this._headerElement.getBoundingClientRect();if(t.height===this._prevHeaderHeight&&this._componentH===this._prevComponentHeight)return;this._prevHeaderHeight=t.height,this._prevComponentHeight=this._componentH;const e=this._componentH-t.height;this._sashVisibleElements.forEach((s=>{s.style.height=`${e}px`,s.style.top=`${t.height}px`}))}_applyCompactViewColumnLabels(){const t=this._getHeaderCells().map((t=>t.innerText));this.querySelectorAll("vscode-table-row").forEach((e=>{e.querySelectorAll("vscode-table-cell").forEach(((e,s)=>{e.columnLabel=t[s],e.compact=!0}))}))}_clearCompactViewColumnLabels(){this.querySelectorAll("vscode-table-cell").forEach((t=>{t.columnLabel="",t.compact=!1}))}_toggleCompactView(){const t=this.getBoundingClientRect().width<this.breakpoint;this.compact!==t&&(this.compact=t,t?this._applyCompactViewColumnLabels():this._clearCompactViewColumnLabels())}_onDefaultSlotChange(){this._assignedElements.forEach((t=>{"vscode-table-header"!==t.tagName.toLowerCase()?"vscode-table-body"!==t.tagName.toLowerCase()||(t.slot="body"):t.slot="header"}))}_onHeaderSlotChange(){this._headerCells=this._queryHeaderCells()}_onBodySlotChange(){if(this._initDefaultColumnSizes(),this._initResizeObserver(),this._updateResizeHandlersSize(),!this._bodyResizeObserver){const t=this._assignedBodyElements[0]??null;t&&(this._bodyResizeObserver=new ResizeObserver(this._bodyResizeObserverCallback),this._bodyResizeObserver.observe(t))}}_onSashMouseOver(t){if(this._isDragging)return;const e=t.currentTarget,s=Number(e.dataset.index);this._sashHovers[s]=!0,this.requestUpdate()}_onSashMouseOut(t){if(t.stopPropagation(),this._isDragging)return;const e=t.currentTarget,s=Number(e.dataset.index);this._sashHovers[s]=!1,this.requestUpdate()}_onSashMouseDown(t){t.stopPropagation();const{pageX:e,currentTarget:s}=t,i=s,o=Number(i.dataset.index),r=i.getBoundingClientRect().x;this._isDragging=!0,this._activeSashElementIndex=o,this._sashHovers[this._activeSashElementIndex]=!0,this._activeSashCursorOffset=this._px2Percent(e-r);const n=this._getHeaderCells();this._headerCellsToResize=[],this._headerCellsToResize.push(n[o]),n[o+1]&&(this._headerCellsToResize[1]=n[o+1]);const a=this._bodySlot.assignedElements()[0].querySelectorAll("vscode-table-row:first-child > vscode-table-cell");this._cellsToResize=[],this._cellsToResize.push(a[o]),a[o+1]&&this._cellsToResize.push(a[o+1]),document.addEventListener("mousemove",this._onResizingMouseMove),document.addEventListener("mouseup",this._onResizingMouseUp)}_updateActiveSashPosition(t){const{prevSashPos:e,nextSashPos:s}=this._getSashPositions();let i=Rs(this.minColumnWidth,this._componentW);null===i&&(i=0);const o=e?e+i:i,r=s?s-i:100-i;let n=this._px2Percent(t-this._componentX-this._percent2Px(this._activeSashCursorOffset));n=Math.max(n,o),n=Math.min(n,r),this._sashPositions[this._activeSashElementIndex]=n,this.requestUpdate()}_getSashPositions(){return{sashPos:this._sashPositions[this._activeSashElementIndex],prevSashPos:this._sashPositions[this._activeSashElementIndex-1]||0,nextSashPos:this._sashPositions[this._activeSashElementIndex+1]||100}}_resizeColumns(t=!0){const{sashPos:e,prevSashPos:s,nextSashPos:i}=this._getSashPositions(),o=`${e-s}%`,r=`${i-e}%`;this._headerCellsToResize[0].style.width=o,this._headerCellsToResize[1]&&(this._headerCellsToResize[1].style.width=r),t&&(this._cellsToResize[0].style.width=o,this._cellsToResize[1]&&(this._cellsToResize[1].style.width=r))}render(){const t=this._sashPositions.map(((t,e)=>{const s=At({sash:!0,hover:this._sashHovers[e],resizable:this.resizable}),i=`${t}%`;return this.resizable?L`
            <div
              class=${s}
              data-index=${e}
              .style=${Ot({left:i})}
              @mousedown=${this._onSashMouseDown}
              @mouseover=${this._onSashMouseOver}
              @mouseout=${this._onSashMouseOut}
            >
              <div class="sash-visible"></div>
              <div class="sash-clickable"></div>
            </div>
          `:L`<div
            class=${s}
            data-index=${e}
            .style=${Ot({left:i})}
          >
            <div class="sash-visible"></div>
          </div>`})),e=At({wrapper:!0,"select-disabled":this._isDragging,"resize-cursor":this._isDragging,"compact-view":this.compact});return L`
      <div class=${e}>
        <div class="header">
          <slot name="caption"></slot>
          <div class="header-slot-wrapper">
            <slot name="header" @slotchange=${this._onHeaderSlotChange}></slot>
          </div>
        </div>
        <vscode-scrollable class="scrollable">
          <div>
            <slot name="body" @slotchange=${this._onBodySlotChange}></slot>
          </div>
        </vscode-scrollable>
        ${t}
        <slot @slotchange=${this._onDefaultSlotChange}></slot>
      </div>
    `}};qs.styles=Ls,Us([ct({reflect:!0})],qs.prototype,"role",void 0),Us([ct({type:Boolean,reflect:!0})],qs.prototype,"resizable",void 0),Us([ct({type:Boolean,reflect:!0})],qs.prototype,"responsive",void 0),Us([ct({type:Boolean,reflect:!0})],qs.prototype,"bordered",void 0),Us([ct({type:Boolean,reflect:!0,attribute:"bordered-columns"})],qs.prototype,"borderedColumns",void 0),Us([ct({type:Boolean,reflect:!0,attribute:"bordered-rows"})],qs.prototype,"borderedRows",void 0),Us([ct({type:Number})],qs.prototype,"breakpoint",void 0),Us([ct({type:Array})],qs.prototype,"columns",null),Us([ct({attribute:"min-column-width"})],qs.prototype,"minColumnWidth",void 0),Us([ct({type:Boolean,reflect:!0,attribute:"delayed-resizing"})],qs.prototype,"delayedResizing",void 0),Us([ct({type:Boolean,reflect:!0})],qs.prototype,"compact",void 0),Us([ct({type:Boolean,reflect:!0})],qs.prototype,"zebra",void 0),Us([ct({type:Boolean,reflect:!0,attribute:"zebra-odd"})],qs.prototype,"zebraOdd",void 0),Us([ut('slot[name="body"]')],qs.prototype,"_bodySlot",void 0),Us([ut(".header")],qs.prototype,"_headerElement",void 0),Us([ut(".scrollable")],qs.prototype,"_scrollableElement",void 0),Us([function(t){return(e,s)=>dt(0,0,{get(){return(this.renderRoot??(pt??=document.createDocumentFragment())).querySelectorAll(t)}})}(".sash-visible")],qs.prototype,"_sashVisibleElements",void 0),Us([vt({flatten:!0,selector:"vscode-table-header, vscode-table-body"})],qs.prototype,"_assignedElements",void 0),Us([vt({slot:"header",flatten:!0,selector:"vscode-table-header"})],qs.prototype,"_assignedHeaderElements",void 0),Us([vt({slot:"body",flatten:!0,selector:"vscode-table-body"})],qs.prototype,"_assignedBodyElements",void 0),Us([ht()],qs.prototype,"_sashPositions",void 0),Us([ht()],qs.prototype,"_isDragging",void 0),qs=Us([mt("vscode-table")],qs);const Hs=[xt,n`
    :host {
      display: block;
    }

    .header {
      align-items: center;
      display: flex;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: var(--vscode-font-weight);
      width: 100%;
    }

    .header {
      border-bottom-color: var(--vscode-settings-headerBorder);
      border-bottom-style: solid;
      border-bottom-width: 1px;
    }

    .header.panel {
      background-color: var(--vscode-panel-background);
      border-bottom-width: 0;
      box-sizing: border-box;
      padding-left: 8px;
      padding-right: 8px;
    }

    slot[name='addons'] {
      display: block;
      margin-left: auto;
    }
  `];var Ks=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};let Ws=class extends gt{constructor(){super(),this.panel=!1,this.role="tablist",this.selectedIndex=0,this._tabHeaders=[],this._tabPanels=[],this._componentId="",this._tabFocus=0,this._componentId=ke()}attributeChangedCallback(t,e,s){super.attributeChangedCallback(t,e,s),"selected-index"===t&&this._setActiveTab(),"panel"===t&&(this._tabHeaders.forEach((t=>t.panel=null!==s)),this._tabPanels.forEach((t=>t.panel=null!==s)))}_dispatchSelectEvent(){this.dispatchEvent(new CustomEvent("vsc-select",{detail:{selectedIndex:this.selectedIndex},composed:!0})),this.dispatchEvent(new CustomEvent("vsc-tabs-select",{detail:{selectedIndex:this.selectedIndex},composed:!0}))}_setActiveTab(){this._tabFocus=this.selectedIndex,this._tabPanels.forEach(((t,e)=>{t.hidden=e!==this.selectedIndex})),this._tabHeaders.forEach(((t,e)=>{t.active=e===this.selectedIndex}))}_focusPrevTab(){0===this._tabFocus?this._tabFocus=this._tabHeaders.length-1:this._tabFocus-=1}_focusNextTab(){this._tabFocus===this._tabHeaders.length-1?this._tabFocus=0:this._tabFocus+=1}_onHeaderKeyDown(t){"ArrowLeft"!==t.key&&"ArrowRight"!==t.key||(t.preventDefault(),this._tabHeaders[this._tabFocus].setAttribute("tabindex","-1"),"ArrowLeft"===t.key?this._focusPrevTab():"ArrowRight"===t.key&&this._focusNextTab(),this._tabHeaders[this._tabFocus].setAttribute("tabindex","0"),this._tabHeaders[this._tabFocus].focus()),"Enter"===t.key&&(t.preventDefault(),this.selectedIndex=this._tabFocus,this._dispatchSelectEvent())}_moveHeadersToHeaderSlot(){const t=this._mainSlotElements.filter((t=>t instanceof ks));t.length>0&&t.forEach((t=>t.setAttribute("slot","header")))}_onMainSlotChange(){this._moveHeadersToHeaderSlot(),this._tabPanels=this._mainSlotElements.filter((t=>t instanceof Cs)),this._tabPanels.forEach(((t,e)=>{t.ariaLabelledby=`t${this._componentId}-h${e}`,t.id=`t${this._componentId}-p${e}`,t.panel=this.panel})),this._setActiveTab()}_onHeaderSlotChange(){this._tabHeaders=this._headerSlotElements.filter((t=>t instanceof ks)),this._tabHeaders.forEach(((t,e)=>{t.tabId=e,t.id=`t${this._componentId}-h${e}`,t.ariaControls=`t${this._componentId}-p${e}`,t.panel=this.panel,t.active=e===this.selectedIndex}))}_onHeaderClick(t){const e=t.composedPath().find((t=>t instanceof ks));e&&(this.selectedIndex=e.tabId,this._setActiveTab(),this._dispatchSelectEvent())}render(){return L`
      <div
        class=${At({header:!0,panel:this.panel})}
        @click=${this._onHeaderClick}
        @keydown=${this._onHeaderKeyDown}
      >
        <slot name="header" @slotchange=${this._onHeaderSlotChange}></slot>
        <slot name="addons"></slot>
      </div>
      <slot @slotchange=${this._onMainSlotChange}></slot>
    `}};Ws.styles=Hs,Ks([ct({type:Boolean,reflect:!0})],Ws.prototype,"panel",void 0),Ks([ct({reflect:!0})],Ws.prototype,"role",void 0),Ks([ct({type:Number,reflect:!0,attribute:"selected-index"})],Ws.prototype,"selectedIndex",void 0),Ks([vt({slot:"header"})],Ws.prototype,"_headerSlotElements",void 0),Ks([vt()],Ws.prototype,"_mainSlotElements",void 0),Ws=Ks([mt("vscode-tabs")],Ws);const Gs=[xt,n`
    :host {
      --hover-outline-color: transparent;
      --hover-outline-style: solid;
      --hover-outline-width: 0;
      --selected-outline-color: transparent;
      --selected-outline-style: solid;
      --selected-outline-width: 0;

      display: block;
      outline: none;
      user-select: none;
    }

    .wrapper {
      height: 100%;
    }

    li {
      list-style: none;
    }

    ul,
    li {
      margin: 0;
      padding: 0;
    }

    ul {
      position: relative;
    }

    :host([indent-guides]) ul ul:before {
      content: '';
      display: block;
      height: 100%;
      position: absolute;
      bottom: 0;
      left: var(--indent-guide-pos);
      top: 0;
      pointer-events: none;
      width: 1px;
      z-index: 1;
    }

    .contents {
      align-items: center;
      display: flex;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: var(--vscode-font-weight);
      outline-offset: -1px;
      padding-right: 12px;
    }

    .multi .contents {
      align-items: flex-start;
    }

    .contents:hover {
      cursor: pointer;
    }

    .arrow-container {
      align-items: center;
      display: flex;
      height: 22px;
      justify-content: center;
      padding-left: 8px;
      padding-right: 6px;
      width: 16px;
    }

    .icon-arrow {
      color: currentColor;
      display: block;
    }

    .theme-icon {
      display: block;
      flex-shrink: 0;
      margin-right: 6px;
    }

    .image-icon {
      background-repeat: no-repeat;
      background-position: 0 center;
      background-size: 16px;
      display: block;
      flex-shrink: 0;
      margin-right: 6px;
      height: 22px;
      width: 16px;
    }

    .multi .contents .theme-icon {
      margin-top: 3px;
    }

    .text-content {
      display: flex;
      line-height: 22px;
    }

    .single .text-content {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      width: 100%;
    }

    .description {
      font-size: 0.9em;
      line-height: 22px;
      margin-left: 0.5em;
      opacity: 0.95;
      white-space: pre;
    }

    .actions {
      display: none;
    }

    .contents.selected > .actions,
    .contents.focused > .actions,
    .contents:hover > .actions {
      display: flex;
    }

    .decorations {
      align-items: center;
      display: flex;
      height: 22px;
      margin-left: 5px;
    }

    .filled-circle {
      margin-right: 3px;
      opacity: 0.4;
    }

    .decoration-text {
      font-size: 90%;
      font-weight: 600;
      margin-right: 3px;
      opacity: 0.75;
    }

    .filled-circle,
    .decoration-text {
      color: var(--color, currentColor);
    }

    .contents:hover .filled-circle,
    .contents:hover .decoration-text {
      color: var(--hover-color, var(--color));
    }

    .contents.focused .filled-circle,
    .contents.focused .decoration-text {
      color: var(--focused-color, var(--color));
    }

    .contents.selected .filled-circle,
    .contents.selected .decoration-text {
      color: var(--selected-color, var(--color));
    }

    /* Theme colors */
    :host(:focus) .wrapper.has-not-focused-item {
      outline: 1px solid var(--vscode-focusBorder);
    }

    :host(:focus) .contents.selected,
    :host(:focus) .contents.focused.selected {
      color: var(--vscode-list-activeSelectionForeground);
      background-color: var(--vscode-list-activeSelectionBackground);
    }

    :host(:focus) .contents.selected .icon-arrow,
    :host(:focus) .contents.selected.focused .icon-arrow,
    :host(:focus) .contents.selected .theme-icon,
    :host(:focus) .contents.selected.focused .theme-icon,
    :host(:focus) .contents.selected .action-icon,
    :host(:focus) .contents.selected.focused .action-icon {
      color: var(--vscode-list-activeSelectionIconForeground);
    }

    :host(:focus) .contents.focused {
      color: var(--vscode-list-focusForeground);
      background-color: var(--vscode-list-focusBackground);
    }

    :host(:focus) .contents.selected.focused {
      outline-color: var(
        --vscode-list-focusAndSelectionOutline,
        var(--vscode-list-focusOutline)
      );
    }

    .contents:hover {
      background-color: var(--vscode-list-hoverBackground);
      color: var(--vscode-list-hoverForeground);
    }

    .contents:hover,
    .contents.selected:hover {
      outline-color: var(--hover-outline-color);
      outline-style: var(--hover-outline-style);
      outline-width: var(--hover-outline-width);
    }

    .contents.selected,
    .contents.selected.focused {
      background-color: var(--vscode-list-inactiveSelectionBackground);
      color: var(--vscode-list-inactiveSelectionForeground);
    }

    .contents.selected,
    .contents.selected.focused {
      outline-color: var(--selected-outline-color);
      outline-style: var(--selected-outline-style);
      outline-width: var(--selected-outline-width);
    }

    .contents.selected .theme-icon {
      color: var(--vscode-list-inactiveSelectionIconForeground);
    }

    .contents.focused {
      background-color: var(--vscode-list-inactiveFocusBackground);
      outline: 1px dotted var(--vscode-list-inactiveFocusOutline);
    }

    :host(:focus) .contents.focused {
      outline: 1px solid var(--vscode-list-focusOutline);
    }

    :host([indent-guides]) ul ul:before {
      background-color: var(--vscode-tree-inactiveIndentGuidesStroke);
    }

    :host([indent-guides]) ul ul.has-active-item:before {
      background-color: var(--vscode-tree-indentGuidesStroke);
    }
  `];var Js=function(t,e,s,i){for(var o,r=arguments.length,n=r<3?e:null===i?i=Object.getOwnPropertyDescriptor(e,s):i,a=t.length-1;a>=0;a--)(o=t[a])&&(n=(r<3?o(n):r>3?o(e,s,n):o(e,s))||n);return r>3&&n&&Object.defineProperty(e,s,n),n};const Ys=(t,e=[])=>{const s=[];return t.forEach(((t,i)=>{const o=[...e,i],r={...t,path:o};t.subItems&&(r.subItems=Ys(t.subItems,o)),s.push(r)})),s},Xs=t=>!!(t.subItems&&Array.isArray(t.subItems)&&t?.subItems?.length>0);let Zs=class extends gt{constructor(){super(...arguments),this.indent=8,this.arrows=!1,this.multiline=!1,this.tabindex=0,this.indentGuides=!1,this._data=[],this._selectedItem=null,this._focusedItem=null,this._selectedBranch=null,this._focusedBranch=null,this._handleComponentKeyDownBound=this._handleComponentKeyDown.bind(this)}set data(t){const e=this._data;this._data=Ys(t),this.requestUpdate("data",e)}get data(){return this._data}closeAll(){this._closeSubTreeRecursively(this.data),this.requestUpdate()}deselectAll(){this._deselectItemsRecursively(this.data),this.requestUpdate()}getItemByPath(t){return this._getItemByPath(t)}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._handleComponentKeyDownBound)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._handleComponentKeyDownBound)}_getItemByPath(t){let e=this._data,s=null;return t.forEach(((i,o)=>{o===t.length-1?s=e[i]:e=e[i].subItems})),s}_handleActionClick(t){t.stopPropagation();const e=t.target,s=e.dataset.itemPath,i=e.dataset.index;let o=null,r="",n="";if(s){const t=s.split("/").map((t=>Number(t)));if(o=this._getItemByPath(t),o?.actions){const t=Number(i);o.actions[t]&&(r=o.actions[t].actionId)}o?.value&&(n=o.value)}this.dispatchEvent(new CustomEvent("vsc-run-action",{detail:{actionId:r,item:o,value:n}})),this.dispatchEvent(new CustomEvent("vsc-tree-action",{detail:{actionId:r,item:o,value:n}}))}_renderIconVariant(t){const{type:e,value:s}=t;return"themeicon"===e?L`<vscode-icon name=${s} class="theme-icon"></vscode-icon>`:L`<span
        class="image-icon"
        .style=${Ot({backgroundImage:`url(${s})`})}
      ></span>`}_renderIcon(t){const e={branch:{value:"folder",type:"themeicon"},open:{value:"folder-opened",type:"themeicon"},leaf:{value:"file",type:"themeicon"}};if(t.iconUrls)t.iconUrls.branch&&(e.branch={value:t.iconUrls.branch,type:"image"}),t.iconUrls.leaf&&(e.leaf={value:t.iconUrls.leaf,type:"image"}),t.iconUrls.open&&(e.open={value:t.iconUrls.open,type:"image"});else if("object"==typeof t.icons)t.icons.branch&&(e.branch={value:t.icons.branch,type:"themeicon"}),t.icons.leaf&&(e.leaf={value:t.icons.leaf,type:"themeicon"}),t.icons.open&&(e.open={value:t.icons.open,type:"themeicon"});else if(!t.icons)return L`${q}`;return Xs(t)?t.open?this._renderIconVariant(e.open):this._renderIconVariant(e.branch):this._renderIconVariant(e.leaf)}_renderArrow(t){if(!this.arrows||!Xs(t))return L`${q}`;const{open:e=!1}=t;return L`
      <div class="arrow-container">
        <vscode-icon name=${e?"chevron-down":"chevron-right"} class="icon-arrow"></vscode-icon>
      </div>
    `}_renderActions(t){const e=[];return t.actions&&Array.isArray(t.actions)&&t.actions.forEach(((s,i)=>{if(s.icon){const o=L`<vscode-icon
            name=${s.icon}
            action-icon
            title=${Et(s.tooltip)}
            data-item-path=${Et(t.path?.join("/"))}
            data-index=${i}
            class="action-icon"
            @click=${this._handleActionClick}
          ></vscode-icon>`;e.push(o)}})),e.length>0?L`<div class="actions">${e}</div>`:L`${q}`}_renderDecorations(t){const e=[];return t.decorations&&Array.isArray(t.decorations)&&t.decorations.forEach((t=>{const{appearance:s="text",visibleWhen:i="always",content:o="",color:r="",focusedColor:n="",hoverColor:a="",selectedColor:l=""}=t,c=`visible-when-${i}`,h={};switch(r&&(h["--color"]=r),n&&(h["--focused-color"]=n),a&&(h["--hover-color"]=a),l&&(h["--selected-color"]=l),s){case"counter-badge":e.push(L`<vscode-badge
                variant="counter"
                class=${["counter-badge",c].join(" ")}
                part="counter-badge-decoration"
                >${o}</vscode-badge
              >`);break;case"filled-circle":e.push(L`<vscode-icon
                name="circle-filled"
                size="14"
                class=${["filled-circle",c].join(" ")}
                part="filled-circle-decoration"
                .style=${Ot(h)}
              ></vscode-icon>`);break;case"text":e.push(L`<div
                class=${["decoration-text",c].join(" ")}
                part="caption-decoration"
                .style=${Ot(h)}
              >
                ${o}
              </div>`)}})),e.length>0?L`<div class="decorations" part="decorations">
        ${e}
      </div>`:L`${q}`}_renderTreeItem(t,e){const{open:s=!1,label:i,description:o="",tooltip:r,selected:n=!1,focused:a=!1,subItems:l=[]}=t,{path:c,itemType:h,hasFocusedItem:d=!1,hasSelectedItem:u=!1}=e,p=["contents"],v=s?["open"]:[],b=(c.length-1)*this.indent,f=this.arrows&&"leaf"===h?30+b:b,g=this._renderArrow(t),m=this._renderIcon(t),x=this.arrows?b+16:b+3,y=s&&"branch"===h?L`<ul
            .style=${Ot({"--indent-guide-pos":`${x}px`})}
            class=${At({"has-active-item":d||u})}
          >
            ${this._renderTree(l,c)}
          </ul>`:q,w=o?L`<span class="description" part="description">${o}</span>`:q,k=this._renderActions(t),$=this._renderDecorations(t);return v.push(h),n&&p.push("selected"),a&&p.push("focused"),L`
      <li data-path=${c.join("/")} class=${v.join(" ")}>
        <div
          class=${p.join(" ")}
          .style=${Ot({paddingLeft:`${f+3}px`})}
        >
          ${g}${m}<span
            class="text-content"
            part="text-content"
            title=${Et(r)}
            >${i}${w}</span
          >
          ${k} ${$}
        </div>
        ${y}
      </li>
    `}_renderTree(t,e=[]){const s=[];return t?(t.forEach(((t,i)=>{const o=[...e,i],r=Xs(t)?"branch":"leaf",{selected:n=!1,focused:a=!1,hasFocusedItem:l=!1,hasSelectedItem:c=!1}=t;n&&(this._selectedItem=t),a&&(this._focusedItem=t),s.push(this._renderTreeItem(t,{path:o,itemType:r,hasFocusedItem:l,hasSelectedItem:c}))})),s):q}_selectItem(t){this._selectedItem&&(this._selectedItem.selected=!1),this._focusedItem&&(this._focusedItem.focused=!1),this._selectedItem=t,t.selected=!0,this._focusedItem=t,t.focused=!0,this._selectedBranch&&(this._selectedBranch.hasSelectedItem=!1);let e=null;if(t.path?.length&&t.path.length>1&&(e=this._getItemByPath(t.path.slice(0,-1))),Xs(t))this._selectedBranch=t,t.hasSelectedItem=!0,t.open=!t.open,t.open?(this._selectedBranch=t,t.hasSelectedItem=!0):e&&(this._selectedBranch=e,e.hasSelectedItem=!0);else if(t.path?.length&&t.path.length>1){const e=this._getItemByPath(t.path.slice(0,-1));e&&(this._selectedBranch=e,e.hasSelectedItem=!0)}else this._selectedBranch=t,t.hasSelectedItem=!0;this._emitSelectEvent(this._selectedItem,this._selectedItem.path.join("/")),this.requestUpdate()}_focusItem(t){this._focusedItem&&(this._focusedItem.focused=!1),this._focusedItem=t,t.focused=!0;const e=!!t?.subItems?.length;this._focusedBranch&&(this._focusedBranch.hasFocusedItem=!1);let s=null;t.path?.length&&t.path.length>1&&(s=this._getItemByPath(t.path.slice(0,-1))),e?t.open?(this._focusedBranch=t,t.hasFocusedItem=!0):!t.open&&s&&(this._focusedBranch=s,s.hasFocusedItem=!0):s&&(this._focusedBranch=s,s.hasFocusedItem=!0)}_closeSubTreeRecursively(t){t.forEach((t=>{t.open=!1,t.subItems&&t.subItems.length>0&&this._closeSubTreeRecursively(t.subItems)}))}_deselectItemsRecursively(t){t.forEach((t=>{t.selected&&(t.selected=!1),t.subItems&&t.subItems.length>0&&this._deselectItemsRecursively(t.subItems)}))}_emitSelectEvent(t,e){const{icons:s,label:i,open:o,value:r}=t,n={icons:s,itemType:Xs(t)?"branch":"leaf",label:i,open:o||!1,value:r||i,path:e};this.dispatchEvent(new CustomEvent("vsc-select",{bubbles:!0,composed:!0,detail:n})),this.dispatchEvent(new CustomEvent("vsc-tree-select",{detail:n}))}_focusPrevItem(){if(!this._focusedItem)return void this._focusItem(this._data[0]);const{path:t}=this._focusedItem;if(t&&t?.length>0){const e=t[t.length-1],s=t.length>1;if(e>0){const s=[...t];s[s.length-1]=e-1;const i=this._getItemByPath(s);let o=i;if(i?.open&&i.subItems?.length){const{subItems:t}=i;o=t[t.length-1]}this._focusItem(o)}else if(s){const e=[...t];e.pop(),this._focusItem(this._getItemByPath(e))}}else this._focusItem(this._data[0])}_focusNextItem(){if(!this._focusedItem)return void this._focusItem(this._data[0]);const{path:t,open:e}=this._focusedItem;if(e&&Array.isArray(this._focusedItem.subItems)&&this._focusedItem.subItems.length>0)return void this._focusItem(this._focusedItem.subItems[0]);const s=[...t];s[s.length-1]+=1;let i=this._getItemByPath(s);i?this._focusItem(i):(s.pop(),s.length>0&&(s[s.length-1]+=1,i=this._getItemByPath(s),i&&this._focusItem(i)))}_handleClick(t){const e=t.composedPath().find((t=>t.tagName&&"LI"===t.tagName.toUpperCase()));if(e){const t=(e.dataset.path||"").split("/").map((t=>Number(t))),s=this._getItemByPath(t);this._selectItem(s)}else this._focusedItem&&(this._focusedItem.focused=!1),this._focusedItem=null}_handleComponentKeyDown(t){const e=t.key;[" ","ArrowDown","ArrowUp","Enter","Escape"].includes(t.key)&&(t.stopPropagation(),t.preventDefault()),"Escape"===e&&(this._focusedItem=null),"ArrowUp"===e&&this._focusPrevItem(),"ArrowDown"===e&&this._focusNextItem(),"Enter"!==e&&" "!==e||this._focusedItem&&this._selectItem(this._focusedItem)}render(){const t=At({multi:this.multiline,single:!this.multiline,wrapper:!0,"has-not-focused-item":!this._focusedItem,"selection-none":!this._selectedItem,"selection-single":null!==this._selectedItem});return L`
      <div @click=${this._handleClick} class=${t}>
        <ul>
          ${this._renderTree(this._data)}
        </ul>
      </div>
    `}};Zs.styles=Gs,Js([ct({type:Array,reflect:!1})],Zs.prototype,"data",null),Js([ct({type:Number})],Zs.prototype,"indent",void 0),Js([ct({type:Boolean,reflect:!0})],Zs.prototype,"arrows",void 0),Js([ct({type:Boolean,reflect:!0})],Zs.prototype,"multiline",void 0),Js([ct({type:Number,reflect:!0})],Zs.prototype,"tabindex",void 0),Js([ct({type:Boolean,reflect:!0,attribute:"indent-guides"})],Zs.prototype,"indentGuides",void 0),Js([ht()],Zs.prototype,"_selectedItem",void 0),Js([ht()],Zs.prototype,"_focusedItem",void 0),Js([ht()],Zs.prototype,"_selectedBranch",void 0),Js([ht()],Zs.prototype,"_focusedBranch",void 0),Zs=Js([mt("vscode-tree")],Zs);export{$t as VscodeBadge,Nt as VscodeButton,Kt as VscodeCheckbox,Jt as VscodeCheckboxGroup,Zt as VscodeCollapsible,oe as VscodeContextMenu,ee as VscodeContextMenuItem,ae as VscodeDivider,pe as VscodeFormContainer,fe as VscodeFormGroup,ye as VscodeFormHelper,Ft as VscodeIcon,Fe as VscodeLabel,es as VscodeMultiSelect,Ke as VscodeOption,os as VscodeProgressRing,as as VscodeRadio,Ce as VscodeRadioGroup,us as VscodeScrollable,cs as VscodeSingleSelect,xs as VscodeSplitLayout,ks as VscodeTabHeader,Cs as VscodeTabPanel,qs as VscodeTable,zs as VscodeTableBody,Os as VscodeTableCell,Ms as VscodeTableHeader,Ds as VscodeTableHeaderCell,Ts as VscodeTableRow,Ws as VscodeTabs,ze as VscodeTextarea,je as VscodeTextfield,Zs as VscodeTree};
