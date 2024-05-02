export interface UrlMatch {
    url: string;
    lineIndex: number;
    start: number;
    end: number;
}

export interface ImagePathRecognizer {
    recognize(lineIndex: number, line: string): UrlMatch[];
}
