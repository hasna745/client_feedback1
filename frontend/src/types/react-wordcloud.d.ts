declare module "react-wordcloud" {
  import type { ComponentType } from "react";

  export interface Word {
    text: string;
    value: number;
  }

  export interface WordCloudOptions {
    rotations?: number;
    rotationAngles?: [number, number];
    fontSizes?: [number, number];
    fontFamily?: string;
  }

  interface WordCloudProps {
    words: Word[];
    options?: WordCloudOptions;
  }

  const WordCloud: ComponentType<WordCloudProps>;
  export default WordCloud;
}
