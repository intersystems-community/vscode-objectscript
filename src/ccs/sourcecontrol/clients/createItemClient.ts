import axios from "axios";
import { SourceControlApi } from "../client";
import { ROUTES } from "../routes";

export interface CreateItemRequestBody {
  itemName: string;
}

export interface CreateItemResponse {
  namespace?: string;
  itemIdCriado?: string;
  file?: string;
  error?: string;
}

export interface CreateItemResult {
  status: number;
  data: CreateItemResponse;
}

export class CreateItemClient {
  public constructor(private readonly api: SourceControlApi) {}

  public async create(namespace: string, itemName: string): Promise<CreateItemResult> {
    const response = await this.api.post<CreateItemResponse>(
      ROUTES.createItem(namespace),
      { itemName },
      {
        validateStatus: () => true,
      }
    );

    return {
      status: response.status,
      data: response.data ?? {},
    };
  }

  public static getErrorMessage(error: unknown): string | undefined {
    if (axios.isAxiosError(error) && error.response) {
      const data = error.response.data as Partial<CreateItemResponse> | undefined;
      if (data?.error && typeof data.error === "string") {
        return data.error;
      }
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as any).message === "string"
    ) {
      return (error as { message: string }).message;
    }

    return undefined;
  }
}
