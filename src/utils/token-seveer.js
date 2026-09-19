import axios from "axios";

class TokenSever {
  constructor() {
    this.refreshing = false;
    this.queue = [];
    this.service = this.createService();
  }

  createService() {
    const service = axios.create({
      baseURL: "https://api.tokensever.com",
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
    // 请求拦截器
    service.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem("token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );
    // 响应拦截器
    service.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        const { config, response } = error;
        if (
          config &&
          !config._retry &&
          response?.status === 401 &&
          response?.data?.code === "TOKEN_EXPIRED"
        ) {
          if (config.url?.includes("/api/auth/refresh")) {
            this.clearToken();
            return Promise.reject(error);
          }
          return new Promise((resolve, reject) => {
            this.queue.push({
              config,
              resolve,
              reject,
            });
            this.processQueue();
          });
        }
        return Promise.reject(error);
      },
    );
    return service;
  }
  async processQueue() {
    if (this.refreshing || this.queue.length === 0) {
      return;
    }
    this.refreshing = true;
    try {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        throw new Error("Refresh token is not found");
      }
      const response = await axios.post("/api/auth/refresh", { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } =
        response?.data ?? {};
      if (!accessToken) {
        throw new Error("Access token is not found");
      }
      localStorage.setItem("token", accessToken);
      if (newRefreshToken) {
        localStorage.setItem("refreshToken", newRefreshToken);
      }
      const pending = this.queue;
      this.queue = [];
      pending.forEach(({ config, resolve, reject }) => {
        config._retry = true;
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${accessToken}`;
        this.service(config).then(resolve).catch(reject);
      });
    } catch (error) {
      const pending = this.queue;
      this.queue = [];
      pending.forEach(({ reject }) => reject(error));
      this.clearToken();
    } finally {
      this.refreshing = false;
    }
  }
  clearToken() {
    const pending = this.queue;
    this.queue = [];
    this.refreshing = false;
    pending.forEach(({ reject }) => {
      reject(new Error("Token cleared"));
    });
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    window.location.href = "/login";
  }
}

export default new TokenSever();
