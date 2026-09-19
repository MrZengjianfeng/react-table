// 从 axios 包引入默认导出：用来发 HTTP 请求、以及下面创建独立刷新请求
import axios, {
  // 引入 Axios 实例类型：单例 client 的类型标注
  type AxiosInstance,
  // 引入拦截器里拿到的请求配置类型（含 headers、url、method 等）
  type InternalAxiosRequestConfig,
  // 指定这些符号都来自 axios 这个依赖
} from "axios";

// localStorage 里 access token 的键名，和 token-seveer.js 保持一致
const ACCESS_TOKEN_KEY = "token";
// localStorage 里 refresh token 的键名，用来换新的 access token
const REFRESH_TOKEN_KEY = "refreshToken";
// 刷新接口路径：过期时用 refreshToken 换一对新 token
const REFRESH_PATH = "/api/auth/refresh";
// 只有这些业务码才走静默刷新：TOKEN_EXPIRED 是双 token 约定，10010 是登录过期
const REFRESHABLE_CODES = new Set(["TOKEN_EXPIRED", "10010"]);

// 在官方请求配置上加 _retry：标记这条请求已经因 401 重试过，防止死循环
type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// 排队等待刷新的请求：保存原配置，以及把它从挂起状态唤醒的 resolve/reject
type PendingRequest = {
  // 原始 axios 请求配置，刷新成功后原样重放
  config: RetryableConfig;
  // 重放成功时，把结果交还给当初调用 get/post 的那一方
  resolve: (value: unknown) => void;
  // 重放失败或刷新失败时，把错误交还给当初调用方
  reject: (reason?: unknown) => void;
};

// 未授权回调类型：刷新失败/登出时由业务层注入（例如跳登录页）
type UnauthorizedHandler = () => void;

// axios 单例：整个应用共用一个实例，拦截器只注册一次
let _instance: AxiosInstance | null = null;
// 业务层注入的登出处理函数；没注入时走默认 window.location.href
let _unauthorizedHandler: UnauthorizedHandler | null = null;
// 刷新锁：true 表示正在请求 /api/auth/refresh，其它 401 只能进队列
let refreshing = false;
// 会话代数：登出时自增。持锁 refresh 回来后若代数变了，说明中途已登出，结果必须丢弃
let authEpoch = 0;
// 等待刷新的请求队列：并发 401 时先挂在这里，刷新完再一起重放
const queue: PendingRequest[] = [];

// 计算接口根地址：优先读 Vite 环境变量，否则用当前站点 + /api/
export function getApiBaseUrl(): string {
  // Vite 会把 VITE_ 开头的变量挂到 import.meta.env；可能没配，所以标成可选
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  // 配了环境变量就用它，保证开发/生产切不同后端
  if (envBaseUrl) {
    // axios 的 baseURL 需要以 / 结尾，没有就补上，避免和相对路径拼接出错
    return envBaseUrl.endsWith("/") ? envBaseUrl : `${envBaseUrl}/`;
  }
  // 没配环境变量：用当前页面协议+主机，再拼 /api/，适合同源代理
  return `${window.location.protocol}//${window.location.host}/`;
}

// 把普通对象转成 FormData，供 postForm / putForm 上传或表单提交
function toFormData(data: Record<string, unknown> | null): FormData {
  // 新建空表单；后面按字段 append
  const formData = new FormData();
  // data 可能是 null（调用方没传 body），此时直接返回空 FormData
  if (data != null) {
    // 遍历对象自身可枚举键，每个键对应一个表单字段
    for (const key of Object.keys(data)) {
      // 取出该字段的值，后面按类型决定怎么 append
      const value = data[key];
      // File / Blob 必须原样 append，不能 String()，否则文件会坏
      if (value instanceof Blob) {
        // 二进制字段：浏览器会自动带 filename 和正确的 multipart 边界
        formData.append(key, value);
        // 其它非空值转成字符串再写入，避免 [object Object] 以外的隐式转换失控
      } else if (value != null) {
        // 数字、布尔等先变成字符串，表单字段只能是字符串或 Blob
        formData.append(key, String(value));
      }
    }
  }
  // 返回已经填好字段的 FormData，交给 axios 作为请求体
  return formData;
}

// GET：查询参数走 URL query，不放 body
export function get(api: string, param: unknown, headers: object = {}) {
  // 取单例再 get；params 会被 axios 序列化到 ?a=1&b=2
  return getInstance().get(api, {
    // 查询参数对象
    params: param,
    // 调用方可额外覆盖/补充请求头
    headers,
  });
}

// POST：JSON body（拦截器里会补 Content-Type: application/json）
export function post(api: string, data: unknown = null, headers: object = {}) {
  // 取单例再 post；data 为 null 表示无请求体
  return getInstance().post(api, data, {
    // 调用方可额外覆盖/补充请求头
    headers,
  });
}

// POST 表单：把对象转成 multipart/form-data 再提交（上传文件用这个）
export function postForm(
  // 接口路径，会拼在 baseURL 后面
  api: string,
  // 表单字段；null 表示空表单
  data: Record<string, unknown> | null = null,
  // 额外请求头，默认空对象
  headers: object = {},
) {
  // 先转 FormData，再走同一个带拦截器的实例
  return getInstance().post(api, toFormData(data), {
    // 调用方可额外覆盖/补充请求头；不要手动写 Content-Type，留给浏览器带 boundary
    headers,
  });
}

// PUT 表单：语义同 postForm，只是 HTTP 方法改成 PUT
export function putForm(
  // 接口路径
  api: string,
  // 表单字段；null 表示空表单
  data: Record<string, unknown> | null = null,
  // 额外请求头
  headers: object = {},
) {
  // 转 FormData 后 PUT，适合“整份表单更新”
  return getInstance().put(api, toFormData(data), {
    // 额外请求头同样不要写死 multipart Content-Type
    headers,
  });
}

// PUT 二进制流：直接把 File/Blob/ArrayBuffer 当 body，超时加长到 90 秒
export function putStream(
  api: string,
  file: unknown = null,
  headers: object = {},
) {
  // 大文件上传比普通 JSON 慢，所以单独放宽 timeout
  return getInstance().put(api, file, {
    // 额外请求头（例如自定义 Content-Type）
    headers,
    // 90 秒超时，避免大文件被默认 45 秒掐断
    timeout: 90000,
  });
}

// 注入未授权处理：刷新失败或必须登出时调用，让页面自己决定怎么跳
export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  // 保存到模块级变量，redirectToLogin 里会优先用它
  _unauthorizedHandler = handler;
}

// 登录成功后写入双 token：access 必写，refresh 可选（有的登录接口会一起返回）
export function setAuthToken(accessToken: string, refreshToken?: string) {
  // 短期令牌：之后每次请求拦截器都会读它放到 Authorization
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  // 只有后端同时下发 refresh 才写入，避免用 undefined 覆盖已有值
  if (refreshToken) {
    // 长期令牌：只在 access 过期时拿来换新，平时请求不带它
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

// 登出或刷新失败：两个 token 都清掉，避免过期凭证继续用
export function removeAuthToken() {
  // 删掉 access token
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  // 删掉 refresh token
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// 读当前 access token；没有登录时返回 null
export function getAuthToken() {
  // 拦截器、业务代码都通过它取短期令牌
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

// 读当前 refresh token；没有则无法静默刷新
export function getRefreshToken() {
  // processQueue 换票时用
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

// 判断这次失败是不是刷新接口自己 401 了：刷新接口不能再排队刷新，否则死循环
function isRefreshRequest(config?: RetryableConfig) {
  // url 可能是相对路径；用 includes 兼容带 query 的情况
  return Boolean(config?.url?.includes(REFRESH_PATH));
}

// 判断这次 401 能不能靠 refresh 救回来（过期），而不是踢下线/非法登录
function isRefreshableUnauthorized(response: {
  // HTTP 状态码，过期一般是 401
  status?: number;
  // 业务体里的 code，用来区分“过期”和“被踢”
  data?: { code?: string | number };
}) {
  // 必须同时满足：HTTP 401，且业务码在可刷新集合里
  return (
    // 未登录/令牌失效的 HTTP 语义
    response?.status === 401 &&
    // code 可能是数字，先转字符串再查 Set；没有 code 则空串，查不到
    REFRESHABLE_CODES.has(String(response?.data?.code ?? ""))
  );
}

// 跳登录：优先走业务注入的 handler，没有就硬跳 /login
function redirectToLogin() {
  // 业务层如果注册了（例如 react-router navigate），就不要整页刷新
  if (_unauthorizedHandler) {
    // 把控制权交给页面
    _unauthorizedHandler();
    // 已经处理完，不要再执行默认跳转
    return;
  }
  // 默认行为：整页去 /login（和 token-seveer.js 一致）
  window.location.href = "/login";
}

// 清队列 + 清 token + 跳登录：刷新彻底失败或不可刷新的 401 时走这里
function clearTokensAndRedirect() {
  // 作废当前会话：进行中的 refresh 即使成功也不能再写回 token / 重放
  authEpoch += 1;
  // 取出并清空队列，后面这些请求都不会再重放
  const pending = queue.splice(0, queue.length);
  // 让所有挂起的调用方收到失败，而不是永远 pending
  pending.forEach(({ reject }) => {
    // 统一错误文案，表示是主动清 token，不是接口返回的业务错误
    reject(new Error("Token cleared"));
  });
  // 本地凭证作废
  removeAuthToken();
  // 回到登录页
  redirectToLogin();
  // 不在这里改 refreshing：锁只由 processQueue 的 finally 释放，避免登出把锁解开后
  // 飞着的 refresh 成功写回 token，同时再启动第二次 refresh
}

// 把新的 access token 写进即将重放的那条请求头
function applyAccessToken(config: RetryableConfig, accessToken: string) {
  // headers 有可能是 undefined，先保证是对象再赋值
  config.headers = config.headers ?? {};
  // 双 token 约定：Bearer + access token
  config.headers.Authorization = `Bearer ${accessToken}`;
}

// 消费队列：同一时刻只允许一次 refresh；成功则重放，失败则全部拒绝并登出
async function processQueue() {
  // 已经在刷新，或队列是空的，直接结束，避免并发打多次 refresh
  if (refreshing || queue.length === 0) {
    // 第二种情况：刷新中新进来的请求只 push 进 queue，等 finally 里再捞
    return;
  }
  // 抢到锁，后续 401 只能排队
  refreshing = true;
  // 记下开锁时的会话代数；await 回来后若变了，说明中途已登出
  const epoch = authEpoch;
  // 刷新过程可能失败，用 try/catch/finally 保证锁一定会被释放
  try {
    // 从本地取出长期令牌
    const refreshToken = getRefreshToken();
    // 没有 refresh 就无法换票，当成刷新失败
    if (!refreshToken) {
      // 抛出后进入 catch：拒绝队列并登出
      throw new Error("Refresh token is not found");
    }

    // 用“裸”axios，不走本文件拦截器，否则 refresh 自己 401 会再次入队
    const response = await axios.post(
      // 刷新接口路径
      REFRESH_PATH,
      // 请求体只带 refreshToken，后端据此签发新一对 token
      { refreshToken },
      {
        // 与业务请求同一套 baseURL，相对路径才能打到正确后端
        baseURL: getApiBaseUrl(),
        // 刷新应尽快失败，不要跟业务请求一样等到 45 秒
        timeout: 10000,
        // 明确 JSON，避免被当成 form
        headers: { "Content-Type": "application/json" },
      },
    );
    // 持锁期间若已被挤下线/清 token，丢弃这次换票，绝不能 setAuthToken 写回去
    if (epoch !== authEpoch) {
      // finally 仍会释放锁；队列已在登出路径被拒绝
      return;
    }
    // axios 的 data 才是响应体
    const body = response.data;
    // 兼容两种返回：{ code:200, data:{...} } 或直接 { accessToken, refreshToken }
    const payload = body?.code === 200 ? body.data : body;
    // 新的短期令牌，后面请求和重放都要用
    const accessToken = payload?.accessToken;
    // 有的后端会轮转 refresh（一次性 refresh）；有则一并更新
    const newRefreshToken = payload?.refreshToken;
    // 没拿到 access 视为刷新失败，不能继续拿旧 token 重放
    if (!accessToken) {
      // 进入 catch
      throw new Error("Access token is not found");
    }

    // 先落到 localStorage，后续新请求的拦截器也能读到新 token
    setAuthToken(accessToken, newRefreshToken);

    // 始删掉当前全部元素，原地把 queue 变成 []，同时把删掉的项作为返回值交给 pending
    // 把当前队列全部取出；刷新期间新入队的请求留给 finally 再处理
    const pending = queue.splice(0, queue.length);
    // 逐条用新 token 重放
    pending.forEach(({ config, resolve, reject }) => {
      // 打标：这条如果再次 401，不要再刷新，避免无限重试
      config._retry = true;
      // 重放时请求拦截器也会读新 token，这里再写一次保证本条 config 一定带上
      applyAccessToken(config, accessToken);
      // 走带拦截器的实例重放；成功/失败都接到当初 get/post 返回的 Promise 上
      getInstance()(config).then(resolve).catch(reject);
    });
    // 刷新接口报错、没有 refresh、没有 access，都到这里
  } catch (error) {
    // 中途已经登出：队列和跳转都处理过了，不要再清一次、也不要二次跳登录
    if (epoch !== authEpoch) {
      // 交给 finally 释放锁
      return;
    }
    // 始删掉当前全部元素，原地把 queue 变成 []，同时把删掉的项作为返回值交给 pending
    // 取出剩余排队请求（可能刷新中又进来了）
    const pending = queue.splice(0, queue.length);
    // 全部失败，错误原样传给调用方
    pending.forEach(({ reject }) => reject(error));
    // 凭证不可用：清 token 并去登录
    clearTokensAndRedirect();
    // 无论成功失败，都必须释放锁
  } finally {
    // 允许下一次刷新；这是 refreshing = false 的唯一出口
    refreshing = false;
    // 刷新过程中又有新的 401 入队：锁已释放，再跑一轮
    if (queue.length > 0) {
      // void 表示不等待这次递归，避免 finally 里悬挂 Promise 告警
      void processQueue();
    }
  }
}

// 把当前失败请求挂起，等 refresh 完成后再重放或失败
function enqueueRetry(config: RetryableConfig) {
  // 返回的 Promise 会成为这次 get/post 的最终结果
  return new Promise((resolve, reject) => {
    // 先入队，保证 processQueue 能看见这条
    queue.push({ config, resolve, reject });
    // 尝试启动刷新；如果已经在刷新，processQueue 会立刻 return，这条仍留在队列里
    void processQueue();
  });
}

// 懒创建 axios 单例：第一次发请求时才 create，并挂上请求/响应拦截器
function getInstance() {
  // 已经创建过就直接复用，避免拦截器被注册多次
  if (_instance) {
    // 返回缓存实例
    return _instance;
  }

  // 创建带统一 baseURL 和默认超时的实例
  _instance = axios.create({
    // 所有相对路径都拼在这个根地址后面
    baseURL: getApiBaseUrl(),
    // 普通接口 45 秒超时（putStream 会在单次请求上覆盖成 90 秒）
    timeout: 45000,
  });

  // 请求拦截器：发出去之前补 header、浅拷贝 JSON body
  _instance.interceptors.request.use(
    (sysConfig) => {
      // 读本地 access token；未登录则为 null，下面就不带 Authorization
      const authToken = getAuthToken();
      // 告诉后端 body 是 JSON
      sysConfig.headers.set("Content-Type", "application/json");
      // 希望后端按 JSON 返回（blob 下载仍由 responseType 控制）
      sysConfig.headers.set("accept", "application/json");
      // 已登录才带鉴权头
      if (authToken) {
        // 双 token：Authorization 只放 access，refresh 绝不放到普通请求头
        sysConfig.headers.set("Authorization", `Bearer ${authToken}`);
      }
      // 必须把 config 交还给 axios，请求才会继续发出
      return sysConfig;
    },
    // 请求还没发出就失败（极少见），原样拒绝
    (error) => Promise.reject(error),
  );

  // 响应拦截器：成功则拆业务 data；失败则决定刷新还是登出
  _instance.interceptors.response.use(
    (response) => {
      // 文件下载不要拆包，调用方需要完整 AxiosResponse（含 headers 文件名）
      if (response.config.responseType === "blob") {
        // 原样返回
        return response;
      }
      // 约定成功码 200：只把 data 字段交给业务，少一层包装
      if (response?.data?.code === 200) {
        // 对应后端 { code: 200, data: T }
        return response.data.data;
      }
      // 其它成功 HTTP 但没有 code===200：把整段 body 交给调用方自行判断
      return response.data;
    },
    (error) => {
      // 失败请求的配置；网络错误时也可能没有 config
      const config = error.config as RetryableConfig | undefined;
      // HTTP 响应体；断网/超时则没有 response
      const response = error.response;

      // 没有 HTTP 状态码：超时、DNS、被拦等，无法判断 401，直接抛给调用方
      if (response == null || response.status == null) {
        // 不刷新、不登出
        return Promise.reject(error);
      }
      // 可刷新的 401，且这条还没重试过，且确实有原配置
      if (isRefreshableUnauthorized(response) && config && !config._retry) {
        // 刷新接口自己 401：refresh 也废了，不能再刷新
        if (isRefreshRequest(config)) {
          // 清凭证并去登录
          clearTokensAndRedirect();
          // 把原始错误抛出去
          return Promise.reject(error);
        }
        // 普通业务请求过期：入队，等换票后重放；这个 Promise 就是调用方在 await 的那个
        return enqueueRetry(config);
      }

      // 其它 401：挤下线、非法登录、或已经重试过仍 401，不能再刷新
      if (response.status === 401) {
        // 清凭证并去登录
        clearTokensAndRedirect();
      }

      // 403/500 等其它错误，以及上面 401 处理后，把错误交给调用方
      return Promise.reject(error);
    },
  );

  // 第一次创建完成后返回，之后都走文件顶部的缓存分支
  return _instance;
}
