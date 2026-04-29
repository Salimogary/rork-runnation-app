import { z } from "zod";
import { publicProcedure } from "../../../create-context";

export default publicProcedure
  .input(z.object({ name: z.string() }))
  .mutation(({ input }: { input: any }) => {
    return {
      hello: input.name,
      date: new Date(),
    };
  });
