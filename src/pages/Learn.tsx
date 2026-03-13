import { motion } from "framer-motion";
import { GraduationCap } from "lucide-react";

export default function Learn() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <GraduationCap className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight">Learning Mode</h1>
        <p className="mt-2 text-muted-foreground">
          Add sources to a topic, then come here to study with AI-generated content.
        </p>
      </motion.div>
    </div>
  );
}
