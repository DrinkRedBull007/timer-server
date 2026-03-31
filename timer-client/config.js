// 环境配置
const CONFIG = {
  // 开发环境
  development: {
    SERVER_URL: 'http://localhost:3000',
    ENABLE_DEBUG: true
  },
  // 生产环境
  production: {
    // GitHub Pages 部署时使用阿里云服务器
    SERVER_URL: 'http://8.146.237.94:3000',
    ENABLE_DEBUG: false
  }
};

// 自动检测环境
const ENV = window.location.hostname === 'localhost' || 
            window.location.hostname === '127.0.0.1' 
            ? 'development' 
            : 'production';

// 导出配置
window.TIMER_CONFIG = CONFIG[ENV];
window.TIMER_ENV = ENV;

console.log(`[配置] 当前环境: ${ENV}`, window.TIMER_CONFIG);
