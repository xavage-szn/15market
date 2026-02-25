import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"

export default function MainChart() {
  return (
    <Tabs defaultValue="chart">
      <TabsList>
        <TabsTrigger value="chart">Chart View</TabsTrigger>
        <TabsTrigger value="terminal">Terminal</TabsTrigger>
      </TabsList>
      <TabsContent value="chart">
        <div className="bg-gray-800 p-4 rounded-lg mt-4">
          Chart will go here
        </div>
      </TabsContent>
      <TabsContent value="terminal">
        <div className="bg-gray-800 p-4 rounded-lg mt-4">
          Terminal will go here
        </div>
      </TabsContent>
    </Tabs>
  )
}
