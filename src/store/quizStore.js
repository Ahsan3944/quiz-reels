import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export const useQuizStore = create(
  persist(
    (set) => ({
      quizzes: [],
      addQuiz: (quiz) => set((state) => ({ 
        quizzes: [...state.quizzes, { ...quiz, id: uuidv4(), createdAt: Date.now() }] 
      })),
      updateQuiz: (id, updatedQuiz) => set((state) => ({
        quizzes: state.quizzes.map((q) => q.id === id ? { ...q, ...updatedQuiz } : q)
      })),
      deleteQuiz: (id) => set((state) => ({
        quizzes: state.quizzes.filter((q) => q.id !== id)
      })),
    }),
    {
      name: 'quiz-storage',
    }
  )
);
