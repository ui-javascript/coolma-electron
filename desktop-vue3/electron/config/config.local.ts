import type { AppConfig } from 'ee-core/config';

const config: () => AppConfig = () => {
  return {
    openDevTools: false,
    jobs: {
      messageLog: false,
    },
  };
};

export default config;
